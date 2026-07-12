require('dotenv').config();

const app = require('./app');
const { getLocalIP } = require('./lib/network');

const PORT = process.env.PORT || 8888;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🍓 Pi Home Dashboard corriendo en:`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Red:     http://${getLocalIP()}:${PORT}\n`);
});
