const express = require('express')
const bodyParser = require('body-parser')

let data;
let idleTimeout;

async function startExpress() {
  const app = express();
  app.use(bodyParser.json());

  const onIdle = () => {
    data = null;
  };

  const resetIdleTimer = () => {
    if (idleTimeout) {
      clearTimeout(idleTimeout);
    }
    idleTimeout = setTimeout(onIdle, 5000);
  };

  app.use((req, res, next) => {
    resetIdleTimer();
    next();
  });

  
  app.post('/', (req, res) => {
    data = req.body;
  })
  
  app.listen(30000, () => {
    console.log('Express server running on port 30000');
    resetIdleTimer();
  })
}
const getData = () => data;

module.exports = { startExpress, getData };