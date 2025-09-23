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

// setTimeout(() => {
//     sendOrders("1000101", ["NA", "K", "CL", "ALB", "BUN", "CA"]);
// }, 1000);

// setTimeout(() => {
//     sendOrders("1000101", ["TSH", "LH", "FSH", "DGX", "T4", "HCG",'TU','RTH','T3','FER','PSA','PAP']);
// }, 1000);

//  Обязательные моменты ASTM/IMMULITE протокола

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



// [Record Type (H)] [Delimiter Def.] [Message Control
// ID] [Password] [Sending systems company name]
// [Sending Systems address] [Reserved] [Senders
// Phone#] [Communication parameters] [Receiver ID]
// [Comments/special instructions] [Processing ID]
// [Version#] [Message Date + Time]
// <STX>[FrameNumber]H|\^&||Password|Siemens|Randolph^ 
// New^Jersey^07869||(201)927-
// 2828|8N1|YourSystem||P|1|19940323082858
// <CR><ETX>[CheckSum]<CR><LF></LF>  

// RECEIVER ID - IMMULITE

// "Sender ID - LIS"




// [Record Type (P)][Sequence #][Practice Assigned
// Patient ID][Laboratory Assigned Patient ID][Patient
// ID][Patient Name][Mother's Maiden
// Name][BirthDate][Patient Sex][Patient Race][Patient
// Address][Reserved][Patient Phone #][Attending
// Physician ID][Special Field 1][Special Field
// 2][Patient Height][Patient Weight][Patients Known
// or Suspected Diagnosis] [Patient active
// medications][Patients Diet][Practice Field
// #1][Practice Field #2][Admission and Discharge
// Dates][Admission Status][Location][Nature of
// Alternative Diagnostic Code and
// Classification][Alternative Diagnostic Code and
// Classification][Patient Religion][Marital
// Status][Isolation Status][Language][Hospital
// Service][Hospital Institution][Dosage Category]
// <STX>[FrameNumber]P|1|101|||Riker^Al||19611102|F|||
// ||Bashere<CR><ETX>[CheckSum]<CR><LF></LF>


// [Record Type (O)][Sequence#][Specimen ID
// (Accession#)][Instrument Specimen ID][Universal
// Test ID][Priority][Order Date/Time][Collection
// Date/Time][Collection End Time][Collection
// Volume][Collector ID][Action Code][Danger
// Code][Relevant Clinical Info][Date/Time Specimen
// Received][Specimen Descriptor,Specimen
// Type,Specimen Source][Ordering
// Physician][Physician's Telephone Number][User Field
// No.1][User Field No.2][Lab Field No.1][Lab Field
// No.2][Date/Time results reported or last
// modified][Instrument Charge to Computer
// System][Instrument Section ID][Report
// Types][Reserved Field][Location or ward of Specimen
// Collection][Nosocomial Infection Flag][Specimen
// Service][Specimen Institution]
// <STX>[FrameNumber]O|1|1550623||^^^LH|R|199310110912
// 33|19931011091233<CR><ETX>[CheckSum]<CR><LF></LF>





// [Record Type (R)][Sequence #][Universal Test
// ID][Data (result)][Units][ReferenceRanges] [Result
// abnormal flags][Nature of Abnormality
// Testing][Result Status][Date of change in
// instruments normal values or units][Operator
// ID][Date\Time Test Started][Date\Time Test
// Completed][Instrument ID]
// 6DPSOH5HVXOW0HVVDJH
// <STX>[FrameNumber]R|1|^^^LH|8.2|mIU/
// mL|.7\.7^400\400|N|N|F||test|19931011091233|1993101
// 1091233|Siemens<CR><ETX>[CheckSum]<CR><LF>



// [Record Type (H)] [Delimiter Def.] [Message Control ID]
// [Password] [Sending systems company name] [Sending Systems
// address] [Reserved] [Senders Phone#] [Communication
// parameters] [Receiver ID] [Comments/special instructions]
// [Processing ID] [Version#] [Message Date + Time]
// 1H|\^&||PASSWORD|DPC||Flanders^New^Jersey^07836||973-927-
// 2828|N81|Your System||P|1|19940407120613<CR><ETX>[51
// Checksum] <CR><LF>

// <ENQ>
// Header
// Patient 1
// Order 1
// Order 2
// Order 3
// Terminator
// <EOT>

// [Record Type (P)][Sequence #][Practice Assigned Patient
// ID][Laboratory Assigned Patient ID][Patient ID][Patient
// Name][Mother's Maiden Name][BirthDate][Patient
// Sex][Patient Race][Patient Address][Reserved][Patient
// Phone #][Attending Physician ID][Special Field
// 1][Special Field 2][Patient Height][Patient
// Weight][Patients Known or Suspected Diagnosis] [Patient
// active medications][Patients Diet][Practice Field
// #1][Practice Field #2][Admission and Discharge
// Dates][Admission Status][Location][Nature of
// Alternative Diagnostic Code and
// Classification][Alternative Diagnostic Code and
// Classification][Patient Religion][Marital
// Status][Isolation Status][Language][Hospital
// Service][Hospital Institution][Dosage Category]
// 2P|1|101|||Riker^Al||19611102|F|||||Bashere<CR><ETX>[2ACheck
// Sum] <CR><LF>

// [Record Type (O)][Sequence#][Specimen ID
// (Accession#)][Instrument Specimen ID][Universal Test
// ID][Priority][Order Date/Time][Collection Date/
// Time][Collection End Time][Collection
// Volume][Collector ID][Action Code][Danger
// Code][Relevant Clinical Info][Date/Time Specimen
// Received][Specimen Descriptor,Specimen Type,Specimen
// Source][Ordering Physician][Physician's Telephone
// Number][User Field No.1][User Field No.2][Lab Field
// No.1][Lab Field No.2][Date/Time results reported or
// last modified][Instrument Charge to Computer
// System][Instrument Section ID][Report Types][Reserved
// Field][Location or ward of Specimen
// Collection][Nosocomial Infection Flag][Specimen
// Service][Specimen Institution]
// 3O|1|1550623||^^^LH|R|19931011091233|19931011091233
// <CR><ETX>[6C Checksum] <CR><LF>

// [Record Type (R)][Sequence #][Universal Test ID][Data
// (result)][Units][ReferenceRanges] [Result abnormal
// flags][Nature of Abnormality Testing][Result
// Status][Date of change in instruments normal values or
// units][Operator ID][Date\Time Test Started][Date\Time
// Test Completed][Instrument ID]
// 4R|1|^^^LH|8.2|mIU/
// mL|.7\.7^400\400|N|N|F||test|19931011091233|1993101109
// 1233|DPC<CR><ETX>[8FCheckSum] <CR><LF></LF>