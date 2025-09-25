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
import fs from "fs";

const port = new SerialPort({
    path: "COM4", // свой порт
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: "none",
});

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

const HEADER_BODY = `H|\\^&||DPC|Receiver|||||Sender||T||`;
const TERMINATE_BODY = `L|1|N`;

let buffer = Buffer.alloc(0);

function calcChecksum(frame) {
    let sum = 0;
    for (let i = 0; i < frame.length; i++) {
        sum += frame.charCodeAt(i);
    }
    const cs = (sum % 256).toString(16).toUpperCase().padStart(2, "0");
    return cs;
}
function makeFrame(frameNum, body) {
    const core = `${frameNum}${body}${CODES.CR}${CODES.ETX}`;
    const cs = calcChecksum(core);
    return `${CODES.STX}${core}${cs}${CODES.CR}${CODES.LF}`;
}
function saveAns(chunk) {
    buffer = Buffer.concat([buffer, chunk]);

    let etxIndex;
    while ((etxIndex = buffer.indexOf(CODES.LF)) !== -1) {
        let frameEnd = etxIndex + 1;
        if (buffer.length < frameEnd) return; // ждем пока придет полный кадр

        let frame = buffer.slice(0, frameEnd);
        buffer = buffer.slice(frameEnd); // остаток оставить

        let hex = frame
            .toString("hex")
            .match(/.{1,2}/g)
            .join(" ");

        // запись в файл (новая строка каждый раз)
        fs.appendFileSync(
            "immulite_log.txt",
            `${parseFrameToReadable(frame)}\n`
        );
        fs.appendFileSync("immulite_log_ASCII.txt", `${frame}\n`);
        fs.appendFileSync("immulite_log_HEX.txt", `${hex}\n`);
    }
}
function parseFrameToReadable(buffer) {
    const CONTROL_CHARS = {
        0x02: "<STX>",
        0x03: "<ETX>",
        0x04: "<EOT>",
        0x0a: "<LF>",
        0x0d: "<CR>",
        0x05: "<ENQ>",
        0x06: "<ACK>",
        0x15: "<NAK>",
    };

    let result = "";
    for (const byte of buffer) {
        if (CONTROL_CHARS[byte]) {
            result += CONTROL_CHARS[byte];
        } else {
            result += String.fromCharCode(byte);
        }
    }

    return result;
}
function makeFramesArray(accessions) {
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

    frames.push(makeFrame(frameCount(true), HEADER_BODY));
    accessions.forEach((obj, i) => {
        const { accession, tests } = obj;
        frames.push(makeFrame(frameCount(), `P|${i + 1}|${accession}`));
        tests.forEach((test, j) => {
            frames.push(
                makeFrame(
                    frameCount(),
                    `O|${j + 1}|${accession}||^^^${test}|||||||||||1`
                )
            );
        });
    });

    frames.push(makeFrame(frameCount(), TERMINATE_BODY));
    return frames;
}
function makeCancelFramesArray(accessions) {
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

    frames.push(makeFrame(frameCount(true), HEADER_BODY));
    accessions.forEach((obj, i) => {
        const { accession, tests } = obj;
        frames.push(makeFrame(frameCount(), `P|${i + 1}|${accession}`));
        tests.forEach((test, j) => {
            frames.push(
                makeFrame(
                    frameCount(),
                    `O|${j + 1}|${accession}||^^^${test}|||||||C`
                )
            );
        });
    });

    frames.push(makeFrame(frameCount(), TERMINATE_BODY));
    return frames;
}
function send(fn) {
    return (accessions) => {
        const frames = fn(accessions);

        let current = 0;

        console.log(frames);

        const ackHandler = (data) => {
            if (data?.toString() === CODES.ACK) {
                console.log("📥 ACK получен");

                if (current < frames.length) {
                    const frame = frames[current];
                    console.log("➡️ Отправляем кадр:", frame);
                    current++;
                    port.write(frame);
                } else {
                    console.log("➡️ Все кадры отправлены, шлём EOT");
                    port.write(CODES.EOT);
                    port.off("data", ackHandler);
                }
            } else {
                console.log("пришел не АСК:", JSON.stringify(data));
            }
        };

        port.on("data", ackHandler);
        port.write(CODES.ENQ);
        console.log("ENQ отправлен, ждём ACK");
    };
}

port.on("data", (data) => {
    if (!data instanceof Buffer) return;
    console.log("Пришло (json):", JSON.stringify(data));
    saveAns(data);
    if (data?.toString() === CODES.ENQ) {
        console.log("Отправляем ACK");
        port.write(CODES.ACK);
    }

    if (data?.toString() === CODES.EOT) {
        console.log("Сессия завершена");
    }
});
port.on("open", () => console.log("COM порт открыт, сервер готов."));
port.on("error", (err) => console.error("Ошибка:", err.message));

export const sendOrders = send(makeFramesArray);
export const cancelOrders = send(makeCancelFramesArray);

// setTimeout(() => {
//     sendOrders([{ accession: "21042389", tests: ["RTH"] }]);
// }, 1000);

// setTimeout(() => {
//     cancelOrders([{ accession: "21042389", tests: ["RTH"] }]);
// }, 1000);

//  Рекомендации по улучшению
// Добавить обработку NAK: если NAK, повторяем тот же кадр до 3 раз.
// Добавить обработку EOT.
// Добавить таймауты ожидания (например, 15 секунд).


// [Record Type (H)] [Delimiter Def.] [Message Control ID]
// [Password] [Sending systems company name] [Sending Systems
// address] [Reserved] [Senders Phone#] [Communication
// parameters] [Receiver ID] [Comments/special instructions]
// [Processing ID] [Version#] [Message Date + Time]
// 1H|\^&||PASSWORD|DPC||Flanders^New^Jersey^07836||973-927-
// 2828|N81|Your System||P|1|19940407120613<CR><ETX>[51
// Checksum] <CR><LF>

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


// 6. Системные сообщения

// Что это:
// Прибор может присылать не только результаты анализов, но и сообщения о состоянии системы.
// Типы сообщений:
// QC-данные (Quality Control results)
// Используется для контроля качества, чтобы LIS видел, что прибор работает корректно.
// Пример записи:
// <STX>3R|QC1|^^^GLUCOSE|5.2|mmol/L|N|||20250924|20250924|QC01<ETX>AA<LF>
// Здесь 3R — это идентификатор записи, QC1 — имя QC, ^^^GLUCOSE — тест, 5.2 — результат, AA — ACK.
// Ошибки или предупреждения
// Например, «нет реагента», «повреждена пробирка».
// Пример:
// <STX>3E|ERROR|No Reagent for CBC<ETX>NA<LF>
// <STX> и <ETX> — рамка кадра, NA — NAK (не подтверждено).
// LIS может показать предупреждение оператору.
// Статусы (Ready, Busy, Offline)
// Информируют LIS о текущем состоянии прибора.
// Пример:
// <STX>3S|STATUS|READY<ETX>AA<LF>

// 5. Отмена / удаление результатов
// Что это:
// Иногда необходимо удалить результат анализа, например, если была ошибка в пробе.
// Поле Result Status:
// C — Corrected (исправлен)
// F — Final (окончательный)
// X — Cancelled (отменён)
// Пример отмены результата:
// <STX>4R|1|^^^GLUCOSE|X||0|||20250924|20250924|12345<ETX>AA<LF>
// X в поле результата = отмена анализа.

// 3. Запрос результатов (Query)
// Когда используется:
// LIS хочет получить результат повторно или выборочно по конкретному заказу.
// Структура запроса:
// <STX>2Q|1|21042389<ETX>AA<LF>
// 2Q — Query record
// 21042389 — номер заказа
// Ответ прибора:
// Все доступные R|… записи для этого заказа.
// <STX>4R|1|^^^GLUCOSE|5.2|mmol/L|F|||20250924|20250924|12345<ETX>AA<LF>
