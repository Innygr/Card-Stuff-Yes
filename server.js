const http = require("http");
const config = require("./config.json");

const server = http.createServer((req, res) => {
    if (req.url === "/api/status" && req.method === "GET") {
        res.writeHead(200, {
            "Content-Type": "application/json"
        });

        res.end(JSON.stringify({
            online: true,
            game: "Card Stuff Yes"
        }));

        return;
    }

    res.writeHead(404, {
        "Content-Type": "application/json"
    });

    res.end(JSON.stringify({
        error: "Not found"
    }));
});

server.listen(config.port, config.host, () => {
    console.log(
        `Card Stuff Yes server running on ${config.host}:${config.port}`
    );
});
