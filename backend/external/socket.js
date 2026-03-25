const { Server } = require('socket.io');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { getData } = require('./express');

require('dotenv').config();
const isDevelopment = process.env.NODE_ENV == 'dev';

async function startSocket() {
  let server;
  let io;

  if (isDevelopment) {
    server = http.createServer();

    io = new Server(server, {
      cors: {
        origin: process.env.SERVER_URL,
        methods: ["GET", "POST"]
      }
    })
  } else {
    server = https.createServer({
      key: fs.readFileSync('./key/privkey.pem'),
      cert: fs.readFileSync('./key/fullchain.pem')
    });

    io = new Server(server, {
      cors: {
        origin: process.env.SERVER_URL,
        methods: ["GET", "POST"]
      }
    })
  }


  const userMap = new Map();
  const adminSpeaker = new Set();

  io.on('connection', (socket) => {
    console.log('New client connected: ' + socket.id);
    userMap.set(socket.id, {
      gamerTag: null
    });

    socket.on('join', (data) => {
      if (typeof data !== 'string' || data.length === 0 || data.length > 100) return;
      userMap.set(socket.id, {
        gamerTag: data
      })
      socket.emit('joined', Array.from(adminSpeaker));
    });

    const intervalId = setInterval(() => {
      if (userMap.get(socket.id) != null) {
        const data = getData();
        if (data != null) {
          socket.emit('playerData', data);
        }
      }
    }, 100)

    socket.on('changeSetting', () => {
      io.emit('changeSetting');
    })

    socket.on('onSpeaker', () => {
      const speaker = userMap.get(socket.id);
      adminSpeaker.add(speaker.gamerTag);
      io.emit('setAdminSpeaker', Array.from(adminSpeaker));
    })

    socket.on('offSpeaker', () => {
      const speaker = userMap.get(socket.id);
      adminSpeaker.delete(speaker.gamerTag);
      io.emit('setAdminSpeaker', Array.from(adminSpeaker));
    })

    socket.on('exit', () => {
      const user = userMap.get(socket.id);
      if (user && adminSpeaker.has(user.gamerTag)) {
        adminSpeaker.delete(user.gamerTag);
        io.emit('setAdminSpeaker', Array.from(adminSpeaker));
      }
    })

    socket.on('kick', (data) => {
      if (typeof data !== 'string' || data.length === 0) return;
      const id = Array.from(userMap).find(([k, v]) => v.gamerTag == data)?.[0] || null;
      if (id) {
        io.to(id).emit('kicked');
      }
    })

    socket.on('disconnect', () => {
      clearInterval(intervalId);

      const user = userMap.get(socket.id);
      if (user && adminSpeaker.has(user.gamerTag)) {
        adminSpeaker.delete(user.gamerTag);
        io.emit('setAdminSpeaker', Array.from(adminSpeaker));
      }

      userMap.delete(socket.id);
      console.log('Client disconnected: ' + socket.id);
    });

    socket.on('debug', (data) => {
      const now = Date.now();
      const date = new Date(now);
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, "0");
      const dd = String(date.getDate()).padStart(2, "0");

      const formatDate = `${yyyy}-${mm}-${dd}`;

      const logDir = path.resolve(__dirname, "../logs");
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      // 書き込み先ファイル
      const logPath = path.join(logDir, `${formatDate}.jsonl`);

      // ログを追記（上書きなら flag を外す）
      fs.writeFileSync(logPath, JSON.stringify(data) + "\n", { flag: "a" });
    })
  })

  server.listen(3001, () => {
    console.log('WebSocket server running on port 3001')
  })
}


module.exports = { startSocket };