const express = require('express')
const bodyParser = require('body-parser')

let data;

async function startExpress() {
  const app = express();
  app.use(bodyParser.json());
  
  app.post('/', (req, res) => {
    data = req.body;
  })
  
  app.listen(30000, () => {
    console.log('Express server running on port 30000');
  })
}
const getData = () => data;

module.exports = { startExpress, getData };