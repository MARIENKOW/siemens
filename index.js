// import express from "express";
// import cors from "cors";
// import * as dotenv from "dotenv";
// import cookieParser from "cookie-parser";
// import http from "http";

// dotenv.config();

// const PORT = process.env.PORT;

// const app = express();
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));
// app.use(cookieParser());
// app.use(
//     cors({
//         credentials: true,
//         origin: process.env.CLIENT_URL,
//     })
// );

// const web = http.Server(app);

// // process.on("warning", (warning) => {
// //     if (warning.name === "DeprecationWarning") {
// //         console.log("Deprecation warning stack:", warning.stack);
// //     }
// // });

// try {
//     web.listen(PORT, process.env.SERVER_URL, () =>
//         console.log("Server is working")
//     );
// } catch (e) {
//     console.log(`${e.message}`);
// }

import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";

const port = new SerialPort({
    path: "COM3", // свой порт
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: "none",
});
const parser = port.pipe(new ReadlineParser({ delimiter: "\r\n" }));

const CODES = {
    ENQ: String.fromCharCode(5),
    ACK: String.fromCharCode(6),
    NAK: String.fromCharCode(21),
    EOT: String.fromCharCode(4),
    STX: String.fromCharCode(2),
    ETX: String.fromCharCode(3),
    CR: String.fromCharCode(13),
    LF: String.fromCharCode(10),
};

//!-----------------------------------------------------------------------------
// function calcChecksum(frameOrCore) {
//     const STX = "\x02";
//     const ETX = "\x03";

//     // если передали полный фрейм с STX/ETX — возьмём между ними (включая ETX)
//     const stx = frameOrCore.indexOf(STX);
//     const etx = frameOrCore.indexOf(ETX);
//     let core;
//     if (stx !== -1 && etx !== -1 && etx > stx) {
//         core = frameOrCore.slice(stx + 1, etx + 1); // <-- включает ETX
//     } else {
//         // если передали только core (frameNum + body + CR) — добавляем ETX вручную
//         core = frameOrCore + ETX;
//     }

//     let sum = 0;
//     for (let i = 0; i < core.length; i++) sum += core.charCodeAt(i);
//     sum &= 0xff;
//     return sum.toString(16).toUpperCase().padStart(2, "0");
// }
//!-----------------------------------------------------------------------------

function calcChecksum(frame) {
    let sum = 0;
    for (let i = 0; i < frame.length; i++) {
        sum += frame.charCodeAt(i);
    }
    console.log(sum);
    const cs = (sum % 256).toString(16).toUpperCase().padStart(2, "0");
    return cs;
}

function makeFrame(frameNum, body) {
    const core = `${frameNum}${body}${CODES.CR}${CODES.ETX}`;
    const cs = calcChecksum(core);
    return `${CODES.STX}${core}${cs}${CODES.CR}${CODES.LF}`;
}

// ====== Приём входящих ======
parser.on("data", (data) => {
    console.log("Пришло:", JSON.stringify(data));

    if (data.includes(CODES.ENQ)) {
        console.log("Отправляем ACK");
        port.write(CODES.ACK);
    }

    if (data.includes("|Q|")) {
        console.log("Получен Query:", data);
        // тут можно вызвать sendOrders() автоматически
    }

    if (data.includes("|R|")) {
        console.log("Результаты:", data);
    }

    if (data.includes(CODES.EOT)) {
        console.log("Сессия завершена");
    }
});

port.on("open", () => console.log("COM порт открыт, сервер готов."));
port.on("error", (err) => console.error("Ошибка:", err.message));

function sendOrders(accession, tests = []) {
    const frames = [];
    let f = 1;
    const frameCount = (atr) => {
        if (atr) return f;
        if (f >= 7) {
            f = 0;
            return f;
        }
        return ++f;
    };

    frames.push(makeFrame(frameCount(true), `H|\\^&||||||||||T||`)); // Header
    frames.push(makeFrame(frameCount(), `P|1|${accession}`)); // Patient
    tests.forEach((t, i) => {
        frames.push(
            makeFrame(
                frameCount(),
                `O|${i + 1}|${accession}||^^^${t}|||||||||||1||||||||||`
            )
        );
    });
    frames.push(makeFrame(frameCount(), `L|1|N`)); // Terminator

    console.log("Готовим заказ для", accession, tests);
    console.log(frames);

    let current = -1; // какой кадр

    // === слушаем ACK от прибора ===
    const ackHandler = (data) => {
        if (data.includes(CODES.ACK)) {
            console.log("📥 ACK получен");

            current++;
            if (current < frames.length) {
                const frame = frames[current];
                console.log("➡️ Отправляем кадр:", frame);
                port.write(frame);
            } else {
                console.log("➡️ Все кадры отправлены, шлём EOT");
                port.write(CODES.EOT);
                parser.off("data", ackHandler);
            }
        }
    };

    parser.on("data", ackHandler);

    port.write(CODES.ENQ);
    console.log("➡️ ENQ отправлен, ждём ACK");
}

setTimeout(() => {
    sendOrders("1000101", ["NA", "K", "CL", "ALB", "BUN", "CA"]);
}, 1000);

// 🔑 Обязательные моменты ASTM/IMMULITE протокола

// Уровень порта (физика RS-232)
// 9600 baud
// 8 data bits
// 1 stop bit
// no parity
// null-modem кабель (обязательно перекрещённый).

// Базовый хэндшейк
// LIS шлёт ENQ.
// IMMULITE отвечает ACK.
// LIS отправляет кадр (STX … ETX + checksum + CRLF).
// IMMULITE подтверждает ACK или отбрасывает NAK.
// После последнего кадра LIS шлёт EOT.
// Это называется Block Transfer.

// Checksum (BCC)
// После ETX идёт двухсимвольный контрольный код (hex), рассчитанный по всем байтам от STX до ETX.
// надо проверить: считается модуль 256 от суммы байтов.

// Структура сообщений
// H (Header) — начало сессии.
// P (Patient) — данные пациента или просто ID.
// O (Order) — список тестов.
// L (Terminator) — завершение заказа.
// Иногда R (Result) приходит от IMMULITE при ответе.

// Кадровая нумерация
// Перед каждым блоком (после STX) идёт номер кадра (1–7, потом по кругу).

//  Моменты, которые пока не реализованы
// Обработка NAK
// Если IMMULITE отвечает NAK, LIS должен повторить последний кадр.
// Таймаут ожидания
// Если после ENQ или кадра ACK/NAK не пришёл за X секунд (обычно 15 сек), нужно прервать транзакцию.
// Сейчас ожидание бесконечное.
// Приём данных от IMMULITE
// IMMULITE может сам присылать результаты (R|...) или сообщения об ошибке.
// Нужно уметь парсить входящие кадры (разбивать по STX/ETX и проверять checksum).
// Пакеты могут быть длинные
// Один логический заказ иногда разбивается на несколько кадров (особенно много тестов).
// при приёме нужно склеивать блоки в одно сообщение до L|....
// Завершение сессии
// После EOT IMMULITE может прислать свои ответы.
// Нужно оставить порт открытым и слушать.

//  Рекомендации по улучшению
// Сделать State Machine:
// IDLE → SEND_ENQ → WAIT_ACK → SEND_FRAME → WAIT_ACK → … → SEND_EOT → DONE.
// Добавить обработку NAK: если NAK, повторяем тот же кадр до 3 раз.
// Добавить таймауты ожидания (например, 15 секунд).
// Реализовать парсер входящих сообщений:
// выделять кадры по STX/ETX,
// проверять checksum,
// склеивать H/P/O/L в полноценный заказ или R в результаты.
// Логировать всё в «сыром» виде (hex + ASCII) для отладки.
