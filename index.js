const express = require('express');
const app = express();
app.use(express.static('public'));
app.listen(8888, () => console.log('Home en http://localhost:8888'));