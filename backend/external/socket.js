const { Server } = require('socket.io');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { getData } = require('./express');

require('dotenv').config();
const isDevelopment = process.env.NODE_ENV == 'dev';

async function startSocket() {
  let server;
  let io;

  if(isDevelopment) {
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
      userMap.set(socket.id, {
        gamerTag: data
      })
      socket.emit('joined', Array.from(adminSpeaker));
    });
  
    setInterval(() => {
      if (userMap.get(socket.id) != null) {
        const data = getData();
        socket.emit('playerData', data);
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
      if(adminSpeaker.has(user.gamerTag)) {
        adminSpeaker.delete(user.gamerTag);
        io.emit('setAdminSpeaker', Array.from(adminSpeaker));
      }
    })

    socket.on('kick', (data) => {
      const id = Array.from(userMap).find(([k, v]) => v.gamerTag == data)?.[0] || null;

      io.to(id).emit('kicked');
    })
  
    socket.on('disconnect', () => {
      const user = userMap.get(socket.id);
      if(adminSpeaker.has(user.gamerTag)) {
        adminSpeaker.delete(user.gamerTag);
        io.emit('setAdminSpeaker', Array.from(adminSpeaker));
      }

      userMap.delete(socket.id);
      console.log('Client disconnected: ' + socket.id);
    });
  })
  
  server.listen(3001, () => {
    console.log('WebSocket server running on port 3001')
  })
}


module.exports = { startSocket };