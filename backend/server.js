const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const db = require('./db');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'supersecretkey'; // змінити на безпечний у продакшн

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Middleware для перевірки JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user; // user = { id, username }
    next();
  });
}

// Реєстрація
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const hash = await bcrypt.hash(password, 10);

  try {
    const stmt = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
    const result = stmt.run(username, hash);
    
    const token = jwt.sign({ id: result.lastInsertRowid, username }, JWT_SECRET);
    res.status(201).json({ token }); // ⬅️ Повертаємо токен
  } catch (err) {
    res.status(400).json({ error: 'Користувач уже існує' });
  }
});


// Логін
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: 'Невірне ім’я або пароль' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Невірне ім’я або пароль' });

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
  res.json({ token });
});

// Отримати список завдань
app.get('/todos', authenticateToken, (req, res) => {
  const todos = db.prepare('SELECT * FROM todos WHERE user_id = ?').all(req.user.id);
  res.json(todos);
});

// Додати завдання
app.post('/todos', authenticateToken, (req, res) => {
  const stmt = db.prepare('INSERT INTO todos (user_id, text) VALUES (?, ?)');
  const result = stmt.run(req.user.id, req.body.text);
  res.status(201).json({ id: result.lastInsertRowid, text: req.body.text, completed: 0 });
});

// Оновити завдання
app.put('/todos/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { completed, text } = req.body;

  const todo = db.prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!todo) return res.status(404).json({ error: 'Завдання не знайдено' });

  // Нормалізація значень
  const normalizedCompleted = typeof completed === 'boolean' ? (completed ? 1 : 0) : undefined;
  const normalizedText = typeof text === 'string' ? text : undefined;

  const stmt = db.prepare(`
    UPDATE todos
    SET
      completed = COALESCE(?, completed),
      text = COALESCE(?, text)
    WHERE id = ? AND user_id = ?
  `);

  try {
    stmt.run(normalizedCompleted, normalizedText, id, req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Помилка оновлення' });
  }
});



// Видалити завдання
app.delete('/todos/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM todos WHERE id = ? AND user_id = ?').run(id, req.user.id);
  res.json({ success: true });
});



// Обслуговування фронтенду з папки /frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Головна сторінка
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});