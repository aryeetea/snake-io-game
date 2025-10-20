const express = require("express");
const app = express();
const PORT = 8080;

app.use(express.static(__dirname)); // serve all files in this folder

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
