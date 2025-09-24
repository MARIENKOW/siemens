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

port.on("data", (data) => {
    console.log("Пришло (json):", JSON.stringify(data));
    console.log("Пришло (data):", data);

    if (data?.data === CODES.ENQ) {
        console.log("Отправляем ACK");
        port.write(CODES.ACK);
    }

    if (data?.data === CODES.EOT) {
        console.log("Сессия завершена");
    }
});
port.on("open", () => console.log("COM порт открыт, сервер готов."));
port.on("error", (err) => console.error("Ошибка:", err.message));

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
                    `O|${j + 1}|${accession}||^^^${test}|||||||||||1||||||||||`
                )
            );
        });
    });

    frames.push(makeFrame(frameCount(), TERMINATE_BODY));
    return frames;
}

function sendOrders(accessions) {
    const frames = makeFramesArray(accessions);

    let current = 0;

    console.log(frames);

    const ackHandler = (data) => {
        if (data?.data === CODES.ACK) {
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
}

// setTimeout(() => {
//     sendOrders([{ accession: "21042389", tests: ["RTH"] }]);
// }, 1000);

//  Рекомендации по улучшению
// Добавить обработку NAK: если NAK, повторяем тот же кадр до 3 раз.
// Добавить обработку EOT.
// Добавить таймауты ожидания (например, 15 секунд).
// Реализовать парсер входящих сообщений:
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



// console.log(`
// Ave^Randolph^NJ^07869||(201)927-2828|N81|Receiver||P|1|20250924115456<ETX>AC<LF>
// <STX>2P|1|21042389|||||||||||<ETX>AC<LF>
// <STX>3O|1|21042389||^^^RTH||||||||||||||||||||D0665<ETX>1D<LF>
// <STX>4R|1|^^^RTH|1.31|uIU/mL|0.4000.010^4.0075.0|N|N|F|||20250924111534|20250924115241|D0665<ETX>E0<LF>
// <EOT>
// <STX>5L|1<ETX>3E<LF>
// <EOT>`);

// const buffArr1 =
//     `Пришло: {"type":"Buffer","data":[5]} <Buffer 05> Пришло: {"type":"Buffer","data":[2]} <Buffer 02> Пришло: {"type":"Buffer","data":[49]} <Buffer 31> Пришло: {"type":"Buffer","data":[72]} <Buffer 48> Пришло: {"type":"Buffer","data":[124,92]} <Buffer 7c 5c> Пришло: {"type":"Buffer","data":[94]} <Buffer 5e> Пришло: {"type":"Buffer","data":[38]} <Buffer 26> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[68]} <Buffer 44> Пришло: {"type":"Buffer","data":[80]} <Buffer 50> Пришло: {"type":"Buffer","data":[67]} <Buffer 43> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[83]} <Buffer 53> Пришло: {"type":"Buffer","data":[101]} <Buffer 65> Пришло: {"type":"Buffer","data":[110]} <Buffer 6e> Пришло: {"type":"Buffer","data":[100]} <Buffer 64> Пришло: {"type":"Buffer","data":[101]} <Buffer 65> Пришло: {"type":"Buffer","data":[114]} <Buffer 72> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[49]} <Buffer 31> Пришло: {"type":"Buffer","data":[49]} <Buffer 31> Пришло: {"type":"Buffer","data":[49]} <Buffer 31> Пришло: {"type":"Buffer","data":[32]} <Buffer 20> Пришло: {"type":"Buffer","data":[67]} <Buffer 43> Пришло: {"type":"Buffer","data":[97]} <Buffer 61> Пришло: {"type":"Buffer","data":[110]} <Buffer 6e> Пришло: {"type":"Buffer","data":[102]} <Buffer 66> Пришло: {"type":"Buffer","data":[105]} <Buffer 69> Пришло: {"type":"Buffer","data":[101]} <Buffer 65> Пришло: {"type":"Buffer","data":[108]} <Buffer 6c> Пришло: {"type":"Buffer","data":[100]} <Buffer 64> Пришло: {"type":"Buffer","data":[32]} <Buffer 20> Пришло: {"type":"Buffer","data":[65]} <Buffer 41> Пришло: {"type":"Buffer","data":[118]} <Buffer 76> Пришло: {"type":"Buffer","data":[101]} <Buffer 65> Пришло: {"type":"Buffer","data":[94]} <Buffer 5e> Пришло: {"type":"Buffer","data":[82]} <Buffer 52> Пришло: {"type":"Buffer","data":[97]} <Buffer 61> Пришло: {"type":"Buffer","data":[110]} <Buffer 6e> Пришло: {"type":"Buffer","data":[100]} <Buffer 64> Пришло: {"type":"Buffer","data":[111]} <Buffer 6f> Пришло: {"type":"Buffer","data":[108]} <Buffer 6c> Пришло: {"type":"Buffer","data":[112]} <Buffer 70> Пришло: {"type":"Buffer","data":[104]} <Buffer 68> Пришло: {"type":"Buffer","data":[94]} <Buffer 5e> Пришло: {"type":"Buffer","data":[78]} <Buffer 4e> Пришло: {"type":"Buffer","data":[74]} <Buffer 4a> Пришло: {"type":"Buffer","data":[94]} <Buffer 5e> Пришло: {"type":"Buffer","data":[48]} <Buffer 30> Пришло: {"type":"Buffer","data":[55]} <Buffer 37> Пришло: {"type":"Buffer","data":[56]} <Buffer 38> Пришло: {"type":"Buffer","data":[54]} <Buffer 36> Пришло: {"type":"Buffer","data":[57]} <Buffer 39> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[40]} <Buffer 28> Пришло: {"type":"Buffer","data":[50]} <Buffer 32> Пришло: {"type":"Buffer","data":[48]} <Buffer 30> Пришло: {"type":"Buffer","data":[49]} <Buffer 31> Пришло: {"type":"Buffer","data":[41]} <Buffer 29> Пришло: {"type":"Buffer","data":[57]} <Buffer 39> Пришло: {"type":"Buffer","data":[50]} <Buffer 32> Пришло: {"type":"Buffer","data":[55]} <Buffer 37> Пришло: {"type":"Buffer","data":[45]} <Buffer 2d> Пришло: {"type":"Buffer","data":[50]} <Buffer 32> Пришло: {"type":"Buffer","data":[56]} <Buffer 38> Пришло: {"type":"Buffer","data":[50]} <Buffer 32> Пришло: {"type":"Buffer","data":[56]} <Buffer 38> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[78]} <Buffer 4e> Пришло: {"type":"Buffer","data":[56]} <Buffer 38> Пришло: {"type":"Buffer","data":[49]} <Buffer 31> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[82]} <Buffer 52> Пришло: {"type":"Buffer","data":[101]} <Buffer 65> Пришло: {"type":"Buffer","data":[99]} <Buffer 63> Пришло: {"type":"Buffer","data":[101]} <Buffer 65> Пришло: {"type":"Buffer","data":[105]} <Buffer 69> Пришло: {"type":"Buffer","data":[118]} <Buffer 76> Пришло: {"type":"Buffer","data":[101]} <Buffer 65> Пришло: {"type":"Buffer","data":[114]} <Buffer 72> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[80]} <Buffer 50> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[49]} <Buffer 31> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[50]} <Buffer 32> Пришло: {"type":"Buffer","data":[48]} <Buffer 30> Пришло: {"type":"Buffer","data":[50]} <Buffer 32> Пришло: {"type":"Buffer","data":[53]} <Buffer 35> Пришло: {"type":"Buffer","data":[48]} <Buffer 30> Пришло: {"type":"Buffer","data":[57]} <Buffer 39> Пришло: {"type":"Buffer","data":[50]} <Buffer 32> Пришло: {"type":"Buffer","data":[52]} <Buffer 34> Пришло: {"type":"Buffer","data":[49]} <Buffer 31> Пришло: {"type":"Buffer","data":[49]} <Buffer 31> Пришло: {"type":"Buffer","data":[53]} <Buffer 35> Пришло: {"type":"Buffer","data":[52]} <Buffer 34> Пришло: {"type":"Buffer","data":[53]} <Buffer 35> Пришло: {"type":"Buffer","data":[54]} <Buffer 36> Пришло: {"type":"Buffer","data":[13]} <Buffer 0d> Пришло: {"type":"Buffer","data":[3]} <Buffer 03> Пришло: {"type":"Buffer","data":[65]} <Buffer 41> Пришло: {"type":"Buffer","data":[67]} <Buffer 43> Пришло: {"type":"Buffer","data":[13]} <Buffer 0d> Пришло: {"type":"Buffer","data":[10]} <Buffer 0a> Пришло: {"type":"Buffer","data":[2]} <Buffer 02> Пришло: {"type":"Buffer","data":[50]} <Buffer 32> Пришло: {"type":"Buffer","data":[80]} <Buffer 50> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[49]} <Buffer 31> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[50]} <Buffer 32> Пришло: {"type":"Buffer","data":[49]} <Buffer 31> Пришло: {"type":"Buffer","data":[48]} <Buffer 30> Пришло: {"type":"Buffer","data":[52]} <Buffer 34> Пришло: {"type":"Buffer","data":[50]} <Buffer 32> Пришло: {"type":"Buffer","data":[51]} <Buffer 33> Пришло: {"type":"Buffer","data":[56]} <Buffer 38> Пришло: {"type":"Buffer","data":[57]} <Buffer 39> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[13]} <Buffer 0d> Пришло: {"type":"Buffer","data":[3]} <Buffer 03> Пришло: {"type":"Buffer","data":[65]} <Buffer 41> Пришло: {"type":"Buffer","data":[67]} <Buffer 43> Пришло: {"type":"Buffer","data":[13]} <Buffer 0d> Пришло: {"type":"Buffer","data":[10]} <Buffer 0a> Пришло: {"type":"Buffer","data":[2]} <Buffer 02> Пришло: {"type":"Buffer","data":[51]} <Buffer 33> Пришло: {"type":"Buffer","data":[79]} <Buffer 4f> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[49]} <Buffer 31> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[50]} <Buffer 32> Пришло: {"type":"Buffer","data":[49]} <Buffer 31> Пришло: {"type":"Buffer","data":[48]} <Buffer 30> Пришло: {"type":"Buffer","data":[52]} <Buffer 34> Пришло: {"type":"Buffer","data":[50]} <Buffer 32> Пришло: {"type":"Buffer","data":[51]} <Buffer 33> Пришло: {"type":"Buffer","data":[56]} <Buffer 38> Пришло: {"type":"Buffer","data":[57]} <Buffer 39> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[94]} <Buffer 5e> Пришло: {"type":"Buffer","data":[94]} <Buffer 5e> Пришло: {"type":"Buffer","data":[94]} <Buffer 5e> Пришло: {"type":"Buffer","data":[82]} <Buffer 52> Пришло: {"type":"Buffer","data":[84]} <Buffer 54> Пришло: {"type":"Buffer","data":[72]} <Buffer 48> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[68]} <Buffer 44> Пришло: {"type":"Buffer","data":[48]} <Buffer 30> Пришло: {"type":"Buffer","data":[54]} <Buffer 36> Пришло: {"type":"Buffer","data":[54]} <Buffer 36> Пришло: {"type":"Buffer","data":[53]} <Buffer 35> Пришло: {"type":"Buffer","data":[13]} <Buffer 0d> Пришло: {"type":"Buffer","data":[3]} <Buffer 03> Пришло: {"type":"Buffer","data":[49]} <Buffer 31> Пришло: {"type":"Buffer","data":[68]} <Buffer 44> Пришло: {"type":"Buffer","data":[13]} <Buffer 0d> Пришло: {"type":"Buffer","data":[10]} <Buffer 0a> Пришло: {"type":"Buffer","data":[2]} <Buffer 02> Пришло: {"type":"Buffer","data":[52]} <Buffer 34> Пришло: {"type":"Buffer","data":[82]} <Buffer 52> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[49]} <Buffer 31> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[94]} <Buffer 5e> Пришло: {"type":"Buffer","data":[94]} <Buffer 5e> Пришло: {"type":"Buffer","data":[94]} <Buffer 5e> Пришло: {"type":"Buffer","data":[82]} <Buffer 52> Пришло: {"type":"Buffer","data":[84]} <Buffer 54> Пришло: {"type":"Buffer","data":[72]} <Buffer 48> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[49]} <Buffer 31> Пришло: {"type":"Buffer","data":[46]} <Buffer 2e> Пришло: {"type":"Buffer","data":[51]} <Buffer 33> Пришло: {"type":"Buffer","data":[49]} <Buffer 31> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[117]} <Buffer 75> Пришло: {"type":"Buffer","data":[73]} <Buffer 49> Пришло: {"type":"Buffer","data":[85]} <Buffer 55> Пришло: {"type":"Buffer","data":[47]} <Buffer 2f> Пришло: {"type":"Buffer","data":[109]} <Buffer 6d> Пришло: {"type":"Buffer","data":[76]} <Buffer 4c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[48]} <Buffer 30> Пришло: {"type":"Buffer","data":[46]} <Buffer 2e> Пришло: {"type":"Buffer","data":[52]} <Buffer 34> Пришло: {"type":"Buffer","data":[48]} <Buffer 30> Пришло: {"type":"Buffer","data":[48]} <Buffer 30> Пришло: {"type":"Buffer","data":[92]} <Buffer 5c> Пришло: {"type":"Buffer","data":[48]} <Buffer 30> Пришло: {"type":"Buffer","data":[46]} <Buffer 2e> Пришло: {"type":"Buffer","data":[48]} <Buffer 30> Пришло: {"type":"Buffer","data":[49]} <Buffer 31> Пришло: {"type":"Buffer","data":[48]} <Buffer 30> Пришло: {"type":"Buffer","data":[94]} <Buffer 5e> Пришло: {"type":"Buffer","data":[52]} <Buffer 34> Пришло: {"type":"Buffer","data":[46]} <Buffer 2e> Пришло: {"type":"Buffer","data":[48]} <Buffer 30> Пришло: {"type":"Buffer","data":[48]} <Buffer 30> Пришло: {"type":"Buffer","data":[92]} <Buffer 5c> Пришло: {"type":"Buffer","data":[55]} <Buffer 37> Пришло: {"type":"Buffer","data":[53]} <Buffer 35> Пришло: {"type":"Buffer","data":[46]} <Buffer 2e> Пришло: {"type":"Buffer","data":[48]} <Buffer 30> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[78]} <Buffer 4e> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[78]} <Buffer 4e> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[70]} <Buffer 46> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[50]} <Buffer 32> Пришло: {"type":"Buffer","data":[48]} <Buffer 30> Пришло: {"type":"Buffer","data":[50]} <Buffer 32> Пришло: {"type":"Buffer","data":[53]} <Buffer 35> Пришло: {"type":"Buffer","data":[48]} <Buffer 30> Пришло: {"type":"Buffer","data":[57]} <Buffer 39> Пришло: {"type":"Buffer","data":[50]} <Buffer 32> Пришло: {"type":"Buffer","data":[52]} <Buffer 34> Пришло: {"type":"Buffer","data":[49]} <Buffer 31> Пришло: {"type":"Buffer","data":[49]} <Buffer 31> Пришло: {"type":"Buffer","data":[49]} <Buffer 31> Пришло: {"type":"Buffer","data":[53]} <Buffer 35> Пришло: {"type":"Buffer","data":[51]} <Buffer 33> Пришло: {"type":"Buffer","data":[52]} <Buffer 34> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[50]} <Buffer 32> Пришло: {"type":"Buffer","data":[48]} <Buffer 30> Пришло: {"type":"Buffer","data":[50]} <Buffer 32> Пришло: {"type":"Buffer","data":[53]} <Buffer 35> Пришло: {"type":"Buffer","data":[48]} <Buffer 30> Пришло: {"type":"Buffer","data":[57]} <Buffer 39> Пришло: {"type":"Buffer","data":[50]} <Buffer 32> Пришло: {"type":"Buffer","data":[52]} <Buffer 34> Пришло: {"type":"Buffer","data":[49]} <Buffer 31> Пришло: {"type":"Buffer","data":[49]} <Buffer 31> Пришло: {"type":"Buffer","data":[53]} <Buffer 35> Пришло: {"type":"Buffer","data":[50]} <Buffer 32> Пришло: {"type":"Buffer","data":[52]} <Buffer 34> Пришло: {"type":"Buffer","data":[49]} <Buffer 31> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[68]} <Buffer 44> Пришло: {"type":"Buffer","data":[48]} <Buffer 30> Пришло: {"type":"Buffer","data":[54]} <Buffer 36> Пришло: {"type":"Buffer","data":[54]} <Buffer 36> Пришло: {"type":"Buffer","data":[53]} <Buffer 35> Пришло: {"type":"Buffer","data":[13]} <Buffer 0d> Пришло: {"type":"Buffer","data":[3]} <Buffer 03> Пришло: {"type":"Buffer","data":[69]} <Buffer 45> Пришло: {"type":"Buffer","data":[48]} <Buffer 30> Пришло: {"type":"Buffer","data":[13]} <Buffer 0d> Пришло: {"type":"Buffer","data":[10]} <Buffer 0a> Пришло: {"type":"Buffer","data":[4]} <Buffer 04> Пришло: {"type":"Buffer","data":[2]} <Buffer 02> Пришло: {"type":"Buffer","data":[53,76]} <Buffer 35 4c> Пришло: {"type":"Buffer","data":[124]} <Buffer 7c> Пришло: {"type":"Buffer","data":[49]} <Buffer 31> Пришло: {"type":"Buffer","data":[13]} <Buffer 0d> Пришло: {"type":"Buffer","data":[3]} <Buffer 03> Пришло: {"type":"Buffer","data":[51]} Пришло: {"type":"Buffer","data":[51]} <Buffer 33> Пришло: {"type":"Buffer","data":[51]} <Buffer 33> Пришло: {"type":"Buffer","data":[69]} Пришло: {"type":"Buffer","data":[51]} <Buffer 33> Пришло: {"type":"Buffer","data":[69]} Пришло: {"type":"Buffer","data":[51]} <Buffer 33> Пришло: {"type":"Buffer","data":[51]} Пришло: {"type":"Buffer","data":[51]} <Buffer 33> Пришло: {"type":"Buffer","data":[69]} <Buffer 45> Пришло: {"type":"Buffer","data":[13]} Пришло: {"type":"Buffer","data":[51]} <Buffer 33> Пришло: {"type":"Buffer","data":[69]} <Buffer 45> Пришло: {"type":"Buffer","data":[51]} <Buffer 33> Пришло: {"type":"Buffer","data":[69]} Пришло: {"type":"Buffer","data":[51]} <Buffer 33> Пришло: {"type":"Buffer","data":[69]} <Buffer 33> Пришло: {"type":"Buffer","data":[69]} <Buffer 45> Пришло: {"type":"Buffer","data":[69]} <Buffer 45> <Buffer 45> Пришло: {"type":"Buffer","data":[13]} <Buffer 0d> Пришло: {"type":"Buffer","data":[10]} <Buffer 0a> Пришло: {"type":"Buffer","data":[4]} <Buffer 04> Пришло: {"type":"Buffer","data":[4]} <Buffer 04> <Buffer 0a> Пришло: {"type":"Buffer","data":[4]} <Buffer 04> Пришло: {"type":"Buffer","data":[4]} <Buffer 04> Пришло: {"type":"Buffer","data":[4]} <Buffer 04> Пришло: {"type":"Buffer","data":[4]} <Buffer 04> Пришло: {"type":"Buffer","data":[4]} <Buffer 04> <Buffer 04> Пришло: {"type":"Buffer","data":[4]} <Buffer 04> Пришло: {"type":"Buffer","data":[4]} <Buffer 04> Пришло: {"type":"Buffer","data":[4]} <Buffer 04> Пришло: {"type":"Buffer","data":[4]} <Buffer 04> Пришло: {"type":"Buffer","data":[4]} <Buffer 04> Пришло: {"type":"Buffer","data":[4]} <Buffer 04> Пришло: {"type":"Buffer","data":[4]} <Buffer 04> Пришло: {"type":"Buffer","data":[4]} <Buffer 04> Пришло: {"type":"Buffer","data":[4]} <Buffer 04> Пришло: {"type":"Buffer","data":[4]} <Buffer 04> Пришло: {"type":"Buffer","data":[4]} <Buffer 04> Пришло: {"type":"Buffer","data":[4]} <Buffer 04>`
//         .split(" ")
//         .filter((e) => {
//             try {
//                 const obj = JSON.parse(e);
//                 if (obj instanceof Object) return true;
//             } catch (error) {
//                 return false;
//             }
//         });

// const buffP = buffArr1.map((e) => Buffer.from(JSON.parse(e).data));

// console.log( Buffer.concat(buffP).toString());
// console.log( [Buffer.concat(buffP).toString()]);

// console.log("---------------------------------------------------");

// console.log(buffP.join("") === Buffer.concat(buffP).toString());
// console.log([buffP.join("")]);
