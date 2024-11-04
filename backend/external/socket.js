const { Server } = require('socket.io');
const { createServer } = require('https');
const fs = require('fs');
const { getData } = require('./express');

async function startSocket() {
  const httpServer = createServer({
    key: fs.readFileSync('./key/privkey.pem'),
    cert: fs.readFileSync('./key/fullchain.pem')
  });

  const io = new Server(httpServer, {
    cors: {
      origin: "https://kei-server.com",
      methods: ["GET", "POST"]
    }
  })
  
  const userMap = new Map();
  
  io.on('connection', (socket) => {
    console.log('New client connected: ' + socket.id);
    userMap.set(socket.id, {
      gamerTag: null
    });
  
    socket.on('join', (data) => {
      userMap.set(socket.id, {
        gamerTag: data
      })
      socket.emit('joined');
    });
  
    setInterval(() => {
      if (userMap.get(socket.id) != null) {
        const data = getData();
        socket.emit('playerData', data);
      }
    }, 1000)
  
    socket.on('changeSetting', () => {
      io.emit('changeSetting');
    })
  
    socket.on('disconnect', () => {
      userMap.delete(socket.id);
      console.log('Client disconnected: ' + socket.id);
    });
  })
  
  httpServer.listen(3001, () => {
    console.log('WebSocket server running on port 3001')
  })
}


module.exports = { startSocket };