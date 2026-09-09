const http = require("http");
const config = require("./config.json");

const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Card Stuff Yes server is running!");
});

server.listen(config.port, config.host, () => {
    console.log(`Card Stuff Yes server running on ${config.host}:${config.port}`);
});
