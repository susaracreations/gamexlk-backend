require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const admin = require('firebase-admin');
const PDFDocument = require('pdfkit');
const cors = require('cors');

if (!process.env.GCP_SERVICE_ACCOUNT_KEY) {
    console.error("❌ ERROR: GCP_SERVICE_ACCOUNT_KEY is missing from environment variables!");
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Firebase Admin Config ──────────────────────────────────────────────────
let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_KEY);
} catch (err) {
  console.error("❌ ERROR: Failed to parse GCP_SERVICE_ACCOUNT_KEY. Ensure it is a valid JSON string.");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "gamexlk.firebasestorage.app"
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Debug: Log every incoming request to the terminal
app.use((req, res, next) => {
  console.log(`📡 [${req.method}] ${req.url}`);
  next();
});

// Enable CORS allowing all origins for Vercel frontend connectivity
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.static(path.join(__dirname, '../frontend/build')));

// ─── Helpers ────────────────────────────────────────────────────────────────
// Converts snake_case keys from DB to camelCase for the frontend API
const toCamelCase = (obj) => {
  if (Array.isArray(obj)) {
    return obj.map(v => toCamelCase(v));
  } else if (obj !== null && obj.constructor === Object) {
    return Object.keys(obj).reduce((acc, key) => {
      const camelKey = key.replace(/_([a-z])/g, g => g[1].toUpperCase());
      acc[camelKey] = toCamelCase(obj[key]);
      return acc;
    }, {});
  }
  return obj;
};

const toSlug = (text) => {
  return text.toString().toLowerCase()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start of text
    .replace(/-+$/, '');            // Trim - from end of text
};

// Upload file to Firebase Storage and return the public URL
const uploadImage = async (file) => {
  const fileExt = path.extname(file.originalname);
  const fileName = `${Date.now()}-${uuidv4()}${fileExt}`;
  const blob = bucket.file(fileName);
  const blobStream = blob.createWriteStream({
    metadata: { contentType: file.mimetype }
  });

  return new Promise((resolve, reject) => {
    blobStream.on('error', (err) => reject(err));
    blobStream.on('finish', async () => {
      // Make the file public. Note: Requires appropriate bucket permissions
      await blob.makePublic();
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
      resolve(publicUrl);
    });
    blobStream.end(file.buffer);
  });
};

// Multer for image uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    if (allowed.test(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// ─── Auth Middleware ────────────────────────────────────────────────────────
const SESSIONS = new Set();
const ADMIN_PASSWORD = 'admin'; // Simple hardcoded password

const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (token && SESSIONS.has(token)) {
    next();
  } else {
    res.status(401).json({ success: false, error: 'Unauthorized: Please login first' });
  }
};

// ─── API Routes ──────────────────────────────────────────────────────────────

// Login
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const token = uuidv4();
    SESSIONS.add(token);
    res.json({ success: true, token });
  } else {
    res.status(401).json({ success: false, error: 'Incorrect password' });
  }
});

// GET all games
app.get('/api/games', async (req, res) => {
  try {
    const { genre, platform, search, sort } = req.query;

    let query = db.collection('games');

    if (sort === 'price-asc') query = query.orderBy('price', 'asc');
    else if (sort === 'price-desc') query = query.orderBy('price', 'desc');
    else if (sort === 'rating') query = query.orderBy('rating', 'desc');
    else query = query.orderBy('created_at', 'desc');

    const snapshot = await query.get();
    let games = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Perform filtering in memory to avoid complex Firestore Composite Index requirements
    if (genre && genre !== 'all') {
      games = games.filter(g => g.genre === genre);
    }

    if (platform && platform !== 'all') {
      games = games.filter(g => g.platform === platform);
    }

    if (search) {
      const q = search.toLowerCase();
      games = games.filter(g =>
        (g.title || "").toLowerCase().includes(q) ||
        (g.description || "").toLowerCase().includes(q) ||
        (g.publisher || "").toLowerCase().includes(q)
      );
    }

    res.json({ success: true, games: toCamelCase(games), total: games.length });
  } catch (err) {
    console.error('❌ Firebase Error (GET /games):', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET single game
app.get('/api/games/:idOrSlug', async (req, res) => {
  try {
    const { idOrSlug } = req.params;
    console.log(`🔍 Fetching game: ${idOrSlug}`);
    
    // Try by ID first
    let doc = await db.collection('games').doc(idOrSlug).get();
    
    if (!doc.exists) {
        console.log(`  - Not found by ID, trying slug: ${idOrSlug}`);
        // Try by Slug
        const snapshot = await db.collection('games').where('slug', '==', idOrSlug).limit(1).get();
        if (!snapshot.empty) {
            doc = snapshot.docs[0];
            console.log(`  - Found by slug field: ${idOrSlug}`);
        } else {
            console.log(`  - Not found by slug field, trying fallback title match...`);
            // Fallback for older data without slug: try matching generated slug from title
            const allSnapshot = await db.collection('games').get();
            const found = allSnapshot.docs.find(d => {
                const data = d.data();
                return data.title && toSlug(data.title) === idOrSlug;
            });
            if (found) {
                doc = found;
                console.log(`  - Found by title fallback: ${found.data().title}`);
            }
        }
    }

    if (!doc.exists) {
        console.warn(`  - ❌ Game not found: ${idOrSlug}`);
        return res.status(404).json({ success: false, error: 'Game not found' });
    }
    res.json({ success: true, game: toCamelCase({ id: doc.id, ...doc.data() }) });
  } catch (err) {
    console.error(`❌ Firebase Error (GET /games/${req.params.idOrSlug}):`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST add new game
app.post('/api/games', requireAuth, upload.single('image'), async (req, res) => {
  try {
    const { title, price, genre, platform, rating, description, publisher, releaseDate, trailer, tags } = req.body;
    if (!title || !price) return res.status(400).json({ success: false, error: 'Title and price are required' });

    const gameForDb = {
      id: uuidv4(),
      title: title.trim(),
      slug: toSlug(title),
      price: parseFloat(price),
      genre: genre || 'Other',
      platform: platform || 'PC',
      rating: parseFloat(rating) || 0,
      description: description || '',
      publisher: publisher || 'Unknown',
      release_date: releaseDate || new Date().toISOString().split('T')[0],
      trailer: trailer || '',
      tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      image: req.file ? await uploadImage(req.file) : '/images/default-game.svg',
      created_at: new Date().toISOString()
    };

    await db.collection('games').doc(gameForDb.id).set(gameForDb);
    res.json({ success: true, game: toCamelCase(gameForDb), message: 'Game added successfully!' });
  } catch (err) {
    console.error('❌ Firebase Error (POST /games):', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update game
app.put('/api/games/:id', requireAuth, upload.single('image'), async (req, res) => {
  try {
    const docRef = db.collection('games').doc(req.params.id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Game not found' });
    const current = doc.data();

    const { title, price, genre, platform, rating, description, publisher, releaseDate, trailer, tags } = req.body;

    // Handle image upload and cleanup
    let imageUrl = current.image;
    if (req.file) {
      imageUrl = await uploadImage(req.file);

      // Optional: Delete old image if it was on Firebase Storage
      if (current.image && current.image.includes('storage.googleapis.com')) {
        try {
          const oldFileName = current.image.split('/').pop();
          if (oldFileName) await bucket.file(oldFileName).delete();
        } catch (e) { console.warn("Old image deletion failed", e.message); }
      }
    }

    const updates = {
      title: title?.trim() || current.title,
      price: price ? parseFloat(price) : current.price,
      genre: genre || current.genre,
      platform: platform || current.platform,
      rating: rating ? parseFloat(rating) : current.rating,
      description: description !== undefined ? description : current.description,
      publisher: publisher || current.publisher,
      release_date: releaseDate || current.release_date,
      trailer: trailer !== undefined ? trailer : current.trailer,
      tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : current.tags,
      image: imageUrl,
      slug: title ? toSlug(title) : current.slug
    };

    await docRef.update(updates);
    const updated = await docRef.get();
    res.json({ success: true, game: toCamelCase({ id: updated.id, ...updated.data() }), message: 'Game updated successfully!' });
  } catch (err) {
    console.error('❌ Firebase Error (PUT /games/:id):', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE game
app.delete('/api/games/:id', requireAuth, async (req, res) => {
  try {
    const docRef = db.collection('games').doc(req.params.id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Game not found' });
    const game = doc.data();

    // Remove image file from Storage if it exists
    if (game.image && game.image.includes('storage.googleapis.com')) {
      try {
        const fileName = game.image.split('/').pop();
        if (fileName) await bucket.file(fileName).delete();
      } catch (e) { console.warn("Image deletion failed", e.message); }
    }

    await docRef.delete();

    res.json({ success: true, message: 'Game deleted successfully!' });
  } catch (err) {
    console.error('❌ Firebase Error (DELETE /games/:id):', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET stats
app.get('/api/stats', async (req, res) => {
  try {
    const snapshot = await db.collection('games').get();
    const games = snapshot.docs.map(doc => doc.data());

    const genres = [...new Set(games.map(g => g.genre))];
    const platforms = [...new Set(games.map(g => g.platform))];
    const avgPrice = games.length ? (games.reduce((s, g) => s + g.price, 0) / games.length).toFixed(2) : 0;
    res.json({ success: true, total: games.length, genres, platforms, avgPrice });
  } catch (err) {
    console.error('❌ Firebase Error (GET /stats):', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST add to wishlist
app.post('/api/wishlist', async (req, res) => {
  try {
    const { email, gameId } = req.body;
    console.log('📦 Wishlist Body:', req.body);
    console.log(`❤️ POST /api/wishlist request: ${email} adding game ${gameId}`);
    if (!email || !gameId) return res.status(400).json({ success: false, error: 'Email and Game ID required' });

    const existing = await db.collection('wishlist')
      .where('user_email', '==', email)
      .where('game_id', '==', gameId).limit(1).get();

    if (!existing.empty) return res.json({ success: true, message: 'Already in wishlist' });

    await db.collection('wishlist').add({ user_email: email, game_id: gameId, created_at: new Date().toISOString() });
    res.json({ success: true, message: 'Added to wishlist' });
  } catch (err) {
    console.error('❌ Firebase Error (POST /wishlist):', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET wishlist
app.get('/api/wishlist', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ success: false, error: 'Email required' });

    const snapshot = await db.collection('wishlist').where('user_email', '==', email).get();
    const gameIds = snapshot.docs.map(doc => doc.data().game_id);

    if (gameIds.length === 0) return res.json({ success: true, wishlist: [] });

    // Firestore 'in' query supports up to 30 items
    const gamesSnapshot = await db.collection('games')
      .where(admin.firestore.FieldPath.documentId(), 'in', gameIds.slice(0, 30))
      .get();

    const games = gamesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ success: true, wishlist: toCamelCase(games) });
  } catch (err) {
    console.error('❌ Firebase Error (GET /wishlist):', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE from wishlist
app.delete('/api/wishlist/:gameId', async (req, res) => {
  try {
    const { email } = req.query;
    const { gameId } = req.params;
    console.log(`💔 DELETE /api/wishlist request: ${email} removing game ${gameId}`);
    if (!email) return res.status(400).json({ success: false, error: 'Email required' });

    const snapshot = await db.collection('wishlist')
      .where('user_email', '==', email)
      .where('game_id', '==', gameId).get();

    const batch = db.batch();
    snapshot.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    res.json({ success: true, message: 'Removed from wishlist' });
  } catch (err) {
    console.error('❌ Firebase Error (DELETE /wishlist):', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST generate PDF receipt for checkout
app.post('/api/checkout/generate-pdf', async (req, res) => {
  try {
    const { buyerDetails, cartItems } = req.body;

    if (!buyerDetails || !cartItems || cartItems.length === 0) {
      return res.status(400).json({ success: false, error: 'Buyer details and cart items are required.' });
    }

    // --- Save Order to Firestore ---
    const totalAmount = cartItems.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0);

    await db.collection('orders').add({
      buyer_name: buyerDetails.name,
      buyer_email: buyerDetails.email,
      buyer_phone: buyerDetails.phone,
      total_amount: totalAmount,
      items: cartItems,
      created_at: new Date().toISOString()
    });

    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    // Set headers to trigger a download in the browser
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=receipt.pdf');

    // Pipe the PDF document directly to the response
    doc.pipe(res);

    // --- PDF Content ---

    // Header
    doc.fontSize(22).font('Helvetica-Bold').text('Gamexlk Store Receipt', { align: 'center' });
    doc.moveDown(2);

    // Buyer Details
    doc.fontSize(14).font('Helvetica-Bold').text('Buyer Details:', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica').text(`Name: ${buyerDetails.name || 'N/A'}`);
    doc.text(`Email: ${buyerDetails.email || 'N/A'}`);
    doc.text(`Phone: ${buyerDetails.phone || 'N/A'}`);
    doc.moveDown(2);

    // Order Details Table
    doc.fontSize(14).font('Helvetica-Bold').text('Order Summary:', { underline: true });
    doc.moveDown();

    const tableTop = doc.y;
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Game Title', 50, tableTop);
    doc.text('Price', 450, tableTop, { width: 100, align: 'right' });
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();

    let total = 0;
    doc.font('Helvetica');
    cartItems.forEach(item => {
      const itemY = doc.y;
      doc.text(item.title, 50, itemY, { width: 380 });
      doc.text(`Rs. ${parseFloat(item.price).toFixed(2)}`, 450, itemY, { width: 100, align: 'right' });
      total += parseFloat(item.price);
      doc.moveDown(1.5);
    });

    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();
    doc.fontSize(12).font('Helvetica-Bold').text(`Total: Rs. ${total.toFixed(2)}`, { align: 'right' });
    doc.moveDown(4);

    doc.fontSize(10).font('Helvetica-Oblique').text('Thank you for your purchase!', { align: 'center' });

    doc.end();
  } catch (err) {
    console.error('❌ PDF Generation Error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to generate PDF.' });
  }
});

// GET orders for a specific user (public for demo purposes)
app.get('/api/my-orders', async (req, res) => {
  try {
    console.log('GET /api/my-orders request received');
    const { email } = req.query;
    if (!email) return res.status(400).json({ success: false, error: 'Email required' });

    // Fetch orders ordered by date, then filter by email in memory to avoid index requirements
    const snapshot = await db.collection('orders').orderBy('created_at', 'desc').get();
    
    const orders = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(order => order.buyer_email === email);

    res.json({ success: true, orders: toCamelCase(orders) });
  } catch (err) {
    console.error('❌ Firebase Error (GET /my-orders):', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add this route to handle order placement
app.post('/api/orders', async (req, res) => {
  const {
    buyer_name,
    buyer_email,
    buyer_whatsapp,
    buyer_discord,
    total_amount,
    items
  } = req.body;

  // Basic Validation
  if (!buyer_name || !buyer_email || !buyer_whatsapp || !items || items.length === 0) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  try {
    const orderData = {
      buyer_name,
      buyer_email,
      buyer_whatsapp,
      buyer_discord,
      total_amount,
      items,
      created_at: new Date().toISOString()
    };

    const docRef = await db.collection('orders').add(orderData);
    const data = (await docRef.get()).data();

    res.status(201).json({ success: true, order: { id: docRef.id, ...data } });

  } catch (error) {
    console.error('Error placing order:', error.message);
    res.status(500).json({ success: false, error: 'Failed to place order in database' });
  }
});

// GET all orders (Protected)
app.get('/api/orders', requireAuth, async (req, res) => {
  try {
    const snapshot = await db.collection('orders').orderBy('created_at', 'desc').get();
    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    res.json({ success: true, orders: toCamelCase(orders) });
  } catch (err) {
    console.error('❌ Firebase Error (GET /orders):', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Fallback for SPA-style routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, async () => {
    console.log(`\n🎮 Gamexlk Store running at http://localhost:${PORT}`);
  });
}

// Export for Vercel serverless
module.exports = app;
