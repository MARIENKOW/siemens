import express from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import cookieParser from "cookie-parser";
import http from "http";

dotenv.config();

const PORT = process.env.PORT;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
    cors({
        credentials: true,
        origin: process.env.CLIENT_URL,
    })
);

const web = http.Server(app);

// process.on("warning", (warning) => {
//     if (warning.name === "DeprecationWarning") {
//         console.log("Deprecation warning stack:", warning.stack);
//     }
// });

try {
    web.listen(PORT, process.env.SERVER_URL, () =>
        console.log("Server is working")
    );
} catch (e) {
    console.log(`${e.message}`);
}
