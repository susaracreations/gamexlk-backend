const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');
const PDFDocument = require('pdfkit');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Supabase Config ────────────────────────────────────────────────────────
const BUCKET_NAME = 'game-images';
const supabaseUrl = process.env.SUPABASE_URL || 'https://zblqdrcwjakbdxtguxur.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpibHFkcmN3amFrYmR4dGd1eHVyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzk3NDk0MywiZXhwIjoyMDg5NTUwOTQzfQ.z2ylr9o4qysjNQTpGQH0jEhzFVZNxESywTonj-H_Pcg';
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Upload file to Supabase Storage and return the public URL
const uploadImage = async (file) => {
  const fileExt = path.extname(file.originalname);
  const fileName = `${Date.now()}-${uuidv4()}${fileExt}`;

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(fileName, file.buffer, {
      contentType: file.mimetype
    });

  if (error) throw error;

  const { data } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(fileName);

  return data.publicUrl;
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

    let query = supabase.from('games').select('*');

    if (genre && genre !== 'all') query = query.eq('genre', genre);
    if (platform && platform !== 'all') query = query.eq('platform', platform);
    if (search) {
      const q = search.toLowerCase();
      // Use ILIKE for case-insensitive search across multiple columns
      query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%,publisher.ilike.%${q}%`);
    }

    if (sort === 'price-asc') query = query.order('price', { ascending: true });
    else if (sort === 'price-desc') query = query.order('price', { ascending: false });
    else if (sort === 'rating') query = query.order('rating', { ascending: false });
    else if (sort === 'newest') query = query.order('created_at', { ascending: false });
    else query = query.order('created_at', { ascending: false }); // Default

    const { data: games, error } = await query;
    if (error) throw error;

    res.json({ success: true, games: toCamelCase(games), total: games.length });
  } catch (err) {
    console.error('❌ Supabase Error (GET /games):', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET single game
app.get('/api/games/:id', async (req, res) => {
  try {
    const { data: game, error } = await supabase.from('games').select('*').eq('id', req.params.id).single();
    if (error || !game) return res.status(404).json({ success: false, error: 'Game not found' });
    res.json({ success: true, game: toCamelCase(game) });
  } catch (err) {
    console.error('❌ Supabase Error (GET /games/:id):', err.message);
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

    const { error } = await supabase.from('games').insert(gameForDb);
    if (error) throw error;

    res.json({ success: true, game: toCamelCase(gameForDb), message: 'Game added successfully!' });
  } catch (err) {
    console.error('❌ Supabase Error (POST /games):', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update game
app.put('/api/games/:id', requireAuth, upload.single('image'), async (req, res) => {
  try {
    // 1. Fetch existing game to preserve image if not updating
    const { data: current, error: fetchError } = await supabase.from('games').select('*').eq('id', req.params.id).single();
    if (fetchError || !current) return res.status(404).json({ success: false, error: 'Game not found' });

    const { title, price, genre, platform, rating, description, publisher, releaseDate, trailer, tags } = req.body;

    // Handle image upload and cleanup
    let imageUrl = current.image;
    if (req.file) {
      imageUrl = await uploadImage(req.file);

      // Optional: Delete old image if it was on Supabase
      if (current.image && current.image.includes(`/${BUCKET_NAME}/`)) {
        const oldPath = current.image.split(`/${BUCKET_NAME}/`)[1];
        if (oldPath) await supabase.storage.from(BUCKET_NAME).remove([oldPath]);
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
      // 'updated_at' is handled automatically by the database trigger
    };

    const { data: updated, error: updateError } = await supabase.from('games').update(updates).eq('id', req.params.id).select().single();
    if (updateError) throw updateError;

    res.json({ success: true, game: toCamelCase(updated), message: 'Game updated successfully!' });
  } catch (err) {
    console.error('❌ Supabase Error (PUT /games/:id):', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE game
app.delete('/api/games/:id', requireAuth, async (req, res) => {
  try {
    // 1. Fetch to get image path
    const { data: game, error: fetchError } = await supabase.from('games').select('*').eq('id', req.params.id).single();
    if (fetchError || !game) return res.status(404).json({ success: false, error: 'Game not found' });

    // Remove image file from Supabase Storage if it exists
    if (game.image && game.image.includes(`/${BUCKET_NAME}/`)) {
      const imagePath = game.image.split(`/${BUCKET_NAME}/`)[1];
      if (imagePath) await supabase.storage.from(BUCKET_NAME).remove([imagePath]);
    }

    // 2. Delete from DB
    const { error: deleteError } = await supabase.from('games').delete().eq('id', req.params.id);
    if (deleteError) throw deleteError;

    res.json({ success: true, message: 'Game deleted successfully!' });
  } catch (err) {
    console.error('❌ Supabase Error (DELETE /games/:id):', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET stats
app.get('/api/stats', async (req, res) => {
  try {
    // Fetch light data for stats
    const { data: games, error } = await supabase.from('games').select('genre, platform, price');
    if (error) throw error;

    const genres = [...new Set(games.map(g => g.genre))];
    const platforms = [...new Set(games.map(g => g.platform))];
    const avgPrice = games.length ? (games.reduce((s, g) => s + g.price, 0) / games.length).toFixed(2) : 0;
    res.json({ success: true, total: games.length, genres, platforms, avgPrice });
  } catch (err) {
    console.error('❌ Supabase Error (GET /stats):', err.message);
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

    // --- Save Order to Supabase ---
    const totalAmount = cartItems.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0);

    const { error: dbError } = await supabase.from('orders').insert({
      buyer_name: buyerDetails.name,
      buyer_email: buyerDetails.email,
      buyer_phone: buyerDetails.phone,
      total_amount: totalAmount,
      items: cartItems,
      created_at: new Date().toISOString()
    });

    if (dbError) console.error('❌ Failed to save order to DB:', dbError.message);

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

// Fallback for SPA-style routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, async () => {
    console.log(`\n🎮 Gamexlk Store running at http://localhost:${PORT}`);
    console.log(`👉 API Server ready. If you see 'Proxy error' in React, make sure this terminal stays open!`);

    // Verify Supabase connection
    try {
      console.log('⏳ Verifying Supabase connection...');

      // Timeout if Supabase doesn't respond in 5 seconds
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timed out - Check if Supabase project is paused')), 5000));
      const query = supabase.from('games').select('id').limit(1);
      const { error } = await Promise.race([query, timeout]);

      if (error) {
        console.error('\n❌ SUPABASE CONNECTION FAILED');
        console.error('   Error:', error.message);
        console.error('   Hint: Your SUPABASE_URL or SUPABASE_KEY in server.js might be invalid or expired.');
        console.error('   Action: Update the keys in server.js or check if your Supabase project is paused.\n');
      } else {
        console.log('☁️  Connected to Supabase successfully!');
      }
    } catch (err) {
      console.error('\n❌ SUPABASE CLIENT ERROR');
      console.error('   Error:', err.message);
      console.error('   Action: Check your internet connection and Supabase URL.\n');
    }
  });
}

// Export for Vercel serverless
module.exports = app;

