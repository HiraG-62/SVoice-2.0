const express = require('express')
const bodyParser = require('body-parser')

require('dotenv').config();

let data;
let idleTimeout;

const validatePlayerData = (body) => {
  if (!Array.isArray(body)) return false;

  const requiredFields = ['name', 'dimension', 'x', 'y', 'z', 'telephone', 'hasTelephone',
    'useMegaphone', 'useMicrophone', 'transceiverType', 'transceiverNumber', 'mute',
    'voiceRangeOutput', 'volumeOutput', 'voiceRangeInput', 'volumeInput'];

  return body.every(player => {
    if (typeof player !== 'object' || player === null) return false;
    if (typeof player.name !== 'string' || player.name.length === 0) return false;
    return requiredFields.every(field => field in player);
  });
};

async function startExpress() {
  const app = express();
  app.use(bodyParser.json({ limit: '1mb' }));

  const GAME_API_SECRET = process.env.GAME_API_SECRET;

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
    // ゲームサーバーからのAPIシークレット認証
    if (GAME_API_SECRET) {
      const secret = req.headers['x-api-secret'];
      if (!secret || secret !== GAME_API_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    if (!validatePlayerData(req.body)) {
      return res.status(400).json({ error: 'Invalid player data format' });
    }

    data = req.body;
    res.status(200).json({ success: true });
  })

  app.listen(30000, () => {
    console.log('Express server running on port 30000');
    resetIdleTimer();
  })
}
const getData = () => data;

module.exports = { startExpress, getData };