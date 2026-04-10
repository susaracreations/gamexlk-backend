require('dotenv').config();
// Seed script — run once with: node seed.js
const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');

// Firebase Admin Config
let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_KEY);
} catch (err) {
  console.error("❌ ERROR: Failed to parse GCP_SERVICE_ACCOUNT_KEY in seed script.");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "gamexlk.firebasestorage.app"
});

const db = admin.firestore();

const toSlug = (text) => {
  return text.toString().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
};

const sampleGames = [
  {
    title: "Elden Ring",
    price: 18500,
    genre: "RPG",
    platform: "Multi-platform",
    rating: 4.9,
    description: "Rise, Tarnished, and be guided by grace to brandish the power of the Elden Ring and become an Elden Lord in the Lands Between. A vast open world ARPG from FromSoftware and George R.R. Martin.",
    publisher: "FromSoftware",
    release_date: "2022-02-25",
    trailer: "https://www.youtube.com/embed/E3Huy2cdih0",
    tags: ["Open World", "Soulslike", "Action", "Dark Fantasy"]
  },
  {
    title: "God of War Ragnarök",
    price: 15500,
    genre: "Action",
    platform: "PlayStation 5",
    rating: 4.8,
    description: "Kratos and Atreus must journey to each of the Nine Realms in search of answers as Asgardian forces prepare for a prophesied battle that will end the world. A breathtaking sequel to the acclaimed 2018 title.",
    publisher: "Santa Monica Studio",
    release_date: "2022-11-09",
    trailer: "https://www.youtube.com/embed/EE-4GvjKcfs",
    tags: ["Action", "Story Rich", "Norse Mythology", "Single Player"]
  },
  {
    title: "Cyberpunk 2077",
    price: 12500,
    genre: "RPG",
    platform: "Multi-platform",
    rating: 4.5,
    description: "Cyberpunk 2077 is an open-world action-adventure RPG set in Night City, a megalopolis obsessed with power, glamour and body modification. Play as V, a mercenary outlaw going after a one-of-a-kind implant.",
    publisher: "CD Projekt Red",
    release_date: "2020-12-10",
    trailer: "https://www.youtube.com/embed/8X2kIfS6fb8",
    tags: ["Open World", "Sci-Fi", "RPG", "Cyberpunk", "Mature"]
  },
  {
    title: "Hollow Knight",
    price: 4500,
    genre: "Adventure",
    platform: "Multi-platform",
    rating: 4.8,
    description: "Forge your own path in Hollow Knight, a challenging 2D action-adventure game through a vast ruined kingdom of insects and heroes. Explore twisting caverns, battle tainted creatures and befriend bizarre bugs.",
    publisher: "Team Cherry",
    release_date: "2017-02-24",
    trailer: "",
    tags: ["Metroidvania", "Indie", "Difficult", "Hand-Drawn"]
  },
  {
    title: "Valorant",
    price: 0,
    genre: "FPS",
    platform: "PC",
    rating: 4.3,
    description: "A 5v5 character-based tactical shooter. Precise gameplay, strategic gunplay, and unique agent abilities combine for a one-of-a-kind competitive FPS experience.",
    publisher: "Riot Games",
    release_date: "2020-06-02",
    trailer: "",
    tags: ["Free to Play", "Competitive", "Tactical", "Multiplayer"]
  },
  {
    title: "Red Dead Redemption 2",
    price: 12500,
    genre: "Action",
    platform: "Multi-platform",
    rating: 4.9,
    description: "America, 1899. Arthur Morgan and the Van der Linde gang are outlaws on the run. Across the vast and rugged expanse of America, you'll face a world of unprecedented detail and scale.",
    publisher: "Rockstar Games",
    release_date: "2018-10-26",
    trailer: "https://www.youtube.com/embed/eaW0tYpxyp0",
    tags: ["Open World", "Western", "Immersive", "Story Rich"]
  },
  {
    title: "Grand Theft Auto V",
    price: 9500,
    genre: "Action",
    platform: "Multi-platform",
    rating: 4.7,
    description: "When a young street hustler, a retired bank robber and a terrifying psychopath find themselves entangled with some of the most frightening and deranged elements of the criminal underworld.",
    publisher: "Rockstar Games",
    release_date: "2013-09-17",
    trailer: "https://www.youtube.com/embed/QkkoHAzjnUs",
    tags: ["Open World", "Crime", "Multiplayer", "Moddable"]
  },
  {
    title: "Euro Truck Simulator 2",
    price: 3500,
    genre: "Simulation",
    platform: "PC",
    rating: 4.6,
    description: "Travel across Europe as king of the road, a trucker who delivers important cargo across impressive distances. With dozens of cities to explore, your endurance, skill and speed will all be pushed to their limits.",
    publisher: "SCS Software",
    release_date: "2012-10-18",
    trailer: "https://www.youtube.com/embed/xlTuC18xVII",
    tags: ["Simulation", "Driving", "Relaxing", "Open World"]
  },
  {
    title: "The Crew Motorfest",
    price: 16500,
    genre: "Racing",
    platform: "Multi-platform",
    rating: 4.2,
    description: "The Crew Motorfest has settled in one of the most breathtaking places on Earth: the island of O'ahu, Hawaii. Join high-speed races, themed events, and collect hundreds of iconic cars.",
    publisher: "Ubisoft",
    release_date: "2023-09-14",
    trailer: "https://www.youtube.com/embed/7X8vG_q3_8A",
    tags: ["Racing", "Open World", "Sports", "Multiplayer"]
  },
  {
    title: "Baldur's Gate 3",
    price: 18500,
    genre: "RPG",
    platform: "Multi-platform",
    rating: 4.9,
    description: "Gather your party, and return to the Forgotten Realms in a tale of fellowship and betrayal, sacrifice and survival, and the lure of absolute power.",
    publisher: "Larian Studios",
    release_date: "2023-08-03",
    trailer: "https://www.youtube.com/embed/1T22wNnyph0",
    tags: ["Turn-Based", "Fantasy", "Choices Matter", "Co-op"]
  },
  {
    title: "Ghost of Tsushima",
    price: 14500,
    genre: "Action",
    platform: "PlayStation / PC",
    rating: 4.8,
    description: "In the late 13th century, the Mongol empire has laid waste to entire nations. Jin Sakai must go beyond samurai traditions to wage an unconventional war for the freedom of Tsushima.",
    publisher: "PlayStation Studios",
    release_date: "2020-07-17",
    trailer: "https://www.youtube.com/embed/m7N9uT2p0u4",
    tags: ["Samurai", "Open World", "Stealth", "Beautiful"]
  },
  {
    title: "Minecraft",
    price: 8500,
    genre: "Sandbox",
    platform: "Multi-platform",
    rating: 4.7,
    description: "Explore infinite worlds and build everything from the simplest of homes to the grandest of castles. Play in creative mode with unlimited resources or mine deep into the world in survival mode.",
    publisher: "Mojang Studios",
    release_date: "2011-11-18",
    trailer: "",
    tags: ["Survival", "Crafting", "Building", "Family Friendly"]
  },
  {
    title: "Forza Horizon 5",
    price: 14500,
    genre: "Racing",
    platform: "PC / Xbox",
    rating: 4.7,
    description: "Your ultimate Horizon Adventure awaits! Explore the vibrant and ever-evolving open world landscapes of Mexico with limitless, fun driving action in hundreds of the world’s greatest cars.",
    publisher: "Xbox Game Studios",
    release_date: "2021-11-09",
    trailer: "https://www.youtube.com/embed/FYH9n37B7Yw",
    tags: ["Racing", "Open World", "Graphics", "Simulation"]
  },
  {
    title: "Stray",
    price: 6500,
    genre: "Adventure",
    platform: "Multi-platform",
    rating: 4.6,
    description: "Lost, alone and separated from family, a stray cat must untangle an ancient mystery to escape a long-forgotten cybercity and find their way home.",
    publisher: "Annapurna Interactive",
    release_date: "2022-07-19",
    trailer: "https://www.youtube.com/embed/u84h_LIDf_w",
    tags: ["Cyberpunk", "Cats", "Indie", "Atmospheric"]
  },
  {
    title: "Counter-Strike 2",
    price: 0,
    genre: "FPS",
    platform: "PC",
    rating: 4.0,
    description: "The next installment in the legendary tactical shooter series. CS2 is built on the Source 2 engine and features improved graphics, smoke mechanics, and sub-tick updates.",
    publisher: "Valve",
    release_date: "2023-09-27",
    trailer: "",
    tags: ["Tactical", "Competitive", "Multiplayer", "eSports"]
  },
  {
    title: "Sekiro: Shadows Die Twice",
    price: 12500,
    genre: "Action",
    platform: "Multi-platform",
    rating: 4.8,
    description: "Explore late 1500s Sengoku Japan as you face larger-than-life foes in a dark and twisted world. Unleash an arsenal of deadly prosthetic tools and ninja abilities.",
    publisher: "Activision",
    release_date: "2019-03-22",
    trailer: "https://www.youtube.com/embed/rXMX4YJ7Lks",
    tags: ["Difficult", "Souls-like", "Stealth", "Masterpiece"]
  },
  {
    title: "Resident Evil 4 Remake",
    price: 15500,
    genre: "Horror",
    platform: "Multi-platform",
    rating: 4.9,
    description: "Survival is just the beginning. Six years have passed since the biological disaster in Raccoon City. Leon S. Kennedy tracks the president's kidnapped daughter to a secluded European village.",
    publisher: "Capcom",
    release_date: "2023-03-24",
    trailer: "https://www.youtube.com/embed/idX9_69uN_k",
    tags: ["Horror", "Action", "Zombies", "Atmospheric"]
  },
  {
    title: "Spider-Man 2",
    price: 16500,
    genre: "Action",
    platform: "PlayStation 5",
    rating: 4.9,
    description: "Spider-Men Peter Parker and Miles Morales return for an exciting new adventure in the critically acclaimed franchise for PS5. Swing, jump and utilize the new Web Wings.",
    publisher: "PlayStation Studios",
    release_date: "2023-10-20",
    trailer: "https://www.youtube.com/embed/qZVTkn2NjS0",
    tags: ["Superhero", "Open World", "Action", "Story Rich"]
  },
  {
    title: "Hades",
    price: 5500,
    genre: "Roguelike",
    platform: "Multi-platform",
    rating: 4.8,
    description: "Defy the god of the dead as you hack and slash out of the Underworld in this rogue-like dungeon crawler from the creators of Bastion and Transistor.",
    publisher: "Supergiant Games",
    release_date: "2020-09-17",
    trailer: "",
    tags: ["Roguelike", "Action", "Great Soundtrack", "Replayable"]
  },
  {
    title: "The Witcher 3: Wild Hunt",
    price: 8500,
    genre: "RPG",
    platform: "Multi-platform",
    rating: 4.9,
    description: "The Witcher is a story-driven, next-generation open world role-playing game set in a visually stunning fantasy universe full of meaningful choices and impactful consequences.",
    publisher: "CD Projekt Red",
    release_date: "2015-05-19",
    trailer: "https://www.youtube.com/embed/c0i88t0Kacs",
    tags: ["Open World", "RPG", "Fantasy", "Story Rich"]
  }
];

async function seed() {
  console.log('️  Deleting all existing games from the collection...');
  try {
    const snapshot = await db.collection('games').get();
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
  } catch (err) {
    console.error('❌ Error deleting existing games:', err.message);
    return;
  }

  console.log('🌱 Starting to seed new data to Firebase...');

  for (const game of sampleGames) {
    const fullGame = {
      id: uuidv4(),
      ...game,
      slug: toSlug(game.title),
      image: '/images/default-game.svg',
      created_at: new Date().toISOString()
    };

    try {
      await db.collection('games').doc(fullGame.id).set(fullGame);
      console.log(`✅ Added: ${game.title}`);
    } catch (err) {
      console.error(`❌ Failed to add ${game.title}:`, err.message);
    }
  }
  console.log(`\n✨ Processed ${sampleGames.length} games.`);
}

seed();
