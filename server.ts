import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database Configuration
const sqliteDb = new Database("chat.db");

// Database Helper Functions
function dbQuery(sql: string, params: any[] = []) {
  return sqliteDb.prepare(sql).all(...params);
}

function dbGet(sql: string, params: any[] = []) {
  return sqliteDb.prepare(sql).get(...params);
}

function dbRun(sql: string, params: any[] = []) {
  const info = sqliteDb.prepare(sql).run(...params);
  return { lastInsertRowid: info.lastInsertRowid };
}

function initDb() {
  try {
    const usersTable = `
      CREATE TABLE IF NOT EXISTS users (
        email TEXT PRIMARY KEY,
        name TEXT,
        role TEXT
      );
    `;
    const chatsTable = `
      CREATE TABLE IF NOT EXISTS chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_email TEXT,
        title TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;
    const messagesTable = `
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER,
        role TEXT,
        content TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(chat_id) REFERENCES chats(id)
      );
    `;

    sqliteDb.exec(usersTable);
    sqliteDb.exec(chatsTable);
    sqliteDb.exec(messagesTable);

    // SQLite Migrations
    try {
      const tableInfo = sqliteDb.prepare("PRAGMA table_info(users)").all() as any[];
      if (!tableInfo.some(col => col.name === 'name')) sqliteDb.exec("ALTER TABLE users ADD COLUMN name TEXT");
      if (!tableInfo.some(col => col.name === 'role')) sqliteDb.exec("ALTER TABLE users ADD COLUMN role TEXT");
    } catch (e) { console.error("Migration failed:", e); }

    // Seed authorized users
    const authorizedEmails = ["m.ans@ffc.com.pk", "m.junaid@ffc.com.pk", "m.arif@ffc.com.pk"];
    const insertUser = sqliteDb.prepare("INSERT OR IGNORE INTO users (email) VALUES (?)");
    authorizedEmails.forEach(email => insertUser.run(email));
    
    console.log("✅ SQLite database initialized successfully");
  } catch (err: any) {
    console.error("CRITICAL: Database initialization failed!");
    console.error("ERROR:", err.message);
  }
}

async function startServer() {
  initDb();
  
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Auth check
  app.post("/api/auth/login", (req, res) => {
    const { email, name } = req.body;
    const user = dbGet("SELECT * FROM users WHERE email = ?", [email]) as any;
    if (user) {
      if (name) {
        dbRun("UPDATE users SET name = ? WHERE email = ?", [name, email]);
      }
      const updatedUser = dbGet("SELECT * FROM users WHERE email = ?", [email]) as any;
      res.json({ success: true, email: updatedUser.email, name: updatedUser.name, role: updatedUser.role });
    } else {
      res.status(401).json({ success: false, message: "Unauthorized email address." });
    }
  });

  // Chat history
  app.get("/api/chats", (req, res) => {
    const { email } = req.query;
    const chats = dbQuery("SELECT * FROM chats WHERE user_email = ? ORDER BY created_at DESC", [email]);
    res.json(chats);
  });

  app.post("/api/chats", (req, res) => {
    const { email, title } = req.body;
    const result = dbRun("INSERT INTO chats (user_email, title) VALUES (?, ?)", [email, title]);
    res.json({ id: result.lastInsertRowid });
  });

  app.get("/api/chats/:id/messages", (req, res) => {
    const messages = dbQuery("SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC", [req.params.id]);
    res.json(messages);
  });

  app.post("/api/chats/:id/messages", (req, res) => {
    const { role, content } = req.body;
    dbRun("INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)", [req.params.id, role, content]);
    res.json({ success: true });
  });

  app.get("/api/user", (req, res) => {
    const { email } = req.query;
    const user = dbGet("SELECT * FROM users WHERE email = ?", [email]);
    res.json(user);
  });

  app.put("/api/user", (req, res) => {
    const { email, name, role } = req.body;
    dbRun("UPDATE users SET name = ?, role = ? WHERE email = ?", [name, role, email]);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
