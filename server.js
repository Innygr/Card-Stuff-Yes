const http = require("http");
const fs = require("fs");
const crypto = require("crypto");
const config = require("./config.json");


// ================================
// Players
// ================================

const players = [
    {
        id: 0,
        username: "Innygr",
        rank: "Owner",
        passwordHash: null
    },
    {
        id: 1,
        username: "Mythic",
        rank: "Owner",
        passwordHash: null
    }
];

let nextPlayerId = 2;


// ================================
// Password functions
// ================================

// Hash a password
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");

    const hash = crypto.scryptSync(
        password,
        salt,
        64
    ).toString("hex");

    return `${salt}:${hash}`;
}


// Check a password
function checkPassword(password, storedHash) {
    if (!storedHash) {
        return false;
    }

    const [salt, hash] = storedHash.split(":");

    const passwordHash = crypto.scryptSync(
        password,
        salt,
        64
    ).toString("hex");

    return crypto.timingSafeEqual(
        Buffer.from(hash, "hex"),
        Buffer.from(passwordHash, "hex")
    );
}


// ================================
// HTTP Server
// ================================

const server = http.createServer((req, res) => {

    // ================================
    // Test page
    // ================================

    if (req.url === "/" && req.method === "GET") {

        fs.readFile("./test.html", (err, data) => {

            if (err) {
                res.writeHead(500, {
                    "Content-Type": "text/plain"
                });

                res.end("Could not load test page.");
                return;
            }

            res.writeHead(200, {
                "Content-Type": "text/html"
            });

            res.end(data);
        });

        return;
    }


    // ================================
    // Test profile page
    // ================================

    if (req.url === "/profile" && req.method === "GET") {

        fs.readFile("./profile.html", (err, data) => {

            if (err) {
                res.writeHead(500, {
                    "Content-Type": "text/plain"
                });

                res.end("Could not load profile page.");
                return;
            }

            res.writeHead(200, {
                "Content-Type": "text/html"
            });

            res.end(data);
        });

        return;
    }


    // ================================
    // Server status
    // ================================

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


    // ================================
    // Get players
    // ================================

    if (req.url === "/api/players" && req.method === "GET") {

        res.writeHead(200, {
            "Content-Type": "application/json"
        });

        res.end(JSON.stringify(
            players.map(player => ({
                id: player.id,
                username: player.username,
                rank: player.rank
            }))
        ));

        return;
    }


    // ================================
    // Register account
    // ================================

    if (
        req.url === "/api/auth/register" &&
        req.method === "POST"
    ) {

        let body = "";

        req.on("data", chunk => {
            body += chunk;
        });

        req.on("end", () => {

            let data;

            try {
                data = JSON.parse(body);
            } catch {

                res.writeHead(400, {
                    "Content-Type": "application/json"
                });

                res.end(JSON.stringify({
                    error: "Invalid JSON"
                }));

                return;
            }


            const username = data.username;
            const password = data.password;


            // Check fields

            if (!username || !password) {

                res.writeHead(400, {
                    "Content-Type": "application/json"
                });

                res.end(JSON.stringify({
                    error: "Username and password are required"
                }));

                return;
            }


            // Check password length

            if (password.length < 8) {

                res.writeHead(400, {
                    "Content-Type": "application/json"
                });

                res.end(JSON.stringify({
                    error: "Password must be at least 8 characters"
                }));

                return;
            }


            // Check username uniqueness

            const usernameExists = players.some(
                player =>
                    player.username.toLowerCase() ===
                    username.toLowerCase()
            );


            if (usernameExists) {

                res.writeHead(409, {
                    "Content-Type": "application/json"
                });

                res.end(JSON.stringify({
                    error:
                        "Username already exists. Please sign in."
                }));

                return;
            }


            // Create player

            const player = {
                id: nextPlayerId,
                username: username,
                rank: "Player",
                passwordHash: hashPassword(password)
            };


            nextPlayerId++;

            players.push(player);


            // Send result

            res.writeHead(201, {
                "Content-Type": "application/json"
            });

            res.end(JSON.stringify({
                id: player.id,
                username: player.username,
                rank: player.rank
            }));
        });

        return;
    }


    // ================================
    // Login
    // ================================

    if (
        req.url === "/api/auth/login" &&
        req.method === "POST"
    ) {

        let body = "";

        req.on("data", chunk => {
            body += chunk;
        });

        req.on("end", () => {

            let data;

            try {
                data = JSON.parse(body);
            } catch {

                res.writeHead(400, {
                    "Content-Type": "application/json"
                });

                res.end(JSON.stringify({
                    error: "Invalid JSON"
                }));

                return;
            }


            const username = data.username;
            const password = data.password;


            // Check fields

            if (!username || !password) {

                res.writeHead(400, {
                    "Content-Type": "application/json"
                });

                res.end(JSON.stringify({
                    error: "Username and password are required"
                }));

                return;
            }


            // Find player

            const player = players.find(
                player =>
                    player.username.toLowerCase() ===
                    username.toLowerCase()
            );


            if (!player) {

                res.writeHead(401, {
                    "Content-Type": "application/json"
                });

                res.end(JSON.stringify({
                    error: "Invalid username or password"
                }));

                return;
            }


            // Check password

            if (!checkPassword(password, player.passwordHash)) {

                res.writeHead(401, {
                    "Content-Type": "application/json"
                });

                res.end(JSON.stringify({
                    error: "Invalid username or password"
                }));

                return;
            }


            // Successful login

            res.writeHead(200, {
                "Content-Type": "application/json"
            });

            res.end(JSON.stringify({
                success: true,
                player: {
                    id: player.id,
                    username: player.username,
                    rank: player.rank
                }
            }));
        });

        return;
    }


    // ================================
    // Unknown route
    // ================================

    res.writeHead(404, {
        "Content-Type": "application/json"
    });

    res.end(JSON.stringify({
        error: "Not found"
    }));
});


// ================================
// Start server
// ================================

server.listen(
    config.port,
    config.host,
    () => {
        console.log(
            `Card Stuff Yes server running on ` +
            `${config.host}:${config.port}`
        );
    }
);
