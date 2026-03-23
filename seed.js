// Seed script — run once with: node seed.js
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

// Supabase Admin Config (Service Role)
const supabaseUrl = 'https://zblqdrcwjakbdxtguxur.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpibHFkcmN3amFrYmR4dGd1eHVyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzk3NDk0MywiZXhwIjoyMDg5NTUwOTQzfQ.z2ylr9o4qysjNQTpGQH0jEhzFVZNxESywTonj-H_Pcg';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
  }
];

async function seed() {
  console.log('️  Deleting all existing games from the table...');
  // A trick to delete all rows without a complex 'where' clause
  const { error: deleteError } = await supabase.from('games').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  if (deleteError) {
    console.error('❌ Error deleting existing games:', deleteError.message);
    return; // Stop if we can't clear the table
  }

  console.log('🌱 Starting to seed new data to Supabase...');

  for (const game of sampleGames) {
    const fullGame = {
      id: uuidv4(),
      ...game,
      image: '/images/default-game.svg',
      created_at: new Date().toISOString()
    };

    const { error } = await supabase.from('games').insert(fullGame);

    if (error) {
      console.error(`❌ Failed to add ${game.title}:`, error.message);
    } else {
      console.log(`✅ Added: ${game.title}`);
    }
  }
  console.log(`\n✨ Processed ${sampleGames.length} games.`);
}

seed();
