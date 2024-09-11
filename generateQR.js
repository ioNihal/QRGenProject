const XLSX = require('xlsx');
const QRCode = require('qrcode');
const { createCanvas, loadImage } = require('canvas');
const { MongoClient } = require('mongodb');
const crypto = require('crypto');
const fs = require('fs');
require('dotenv').config();

//conn uri
const uri = process.env.CONNECTION_URI; 
const dbName = 'qrCodeDB';
const collectionName = 'userData';

// Function to hash data
function hashData(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

// Function to generate QR code and place it inside an image card
async function generateQRCardsFromMongo(outputDir) {
    const client = new MongoClient(uri);

    try {
        // Connect to MongoDB
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection(collectionName);

        // Retrieve data from MongoDB
        const users = await collection.find({}).toArray();

        // Ensure the output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        for (const user of users) {
            const { name, registerNo, hashedData } = user;

            // Generate QR code as a data URL
            const qrCodeData = await QRCode.toDataURL(hashedData);

            // Create a canvas for the QR card
            const canvas = createCanvas(400, 600);
            const ctx = canvas.getContext('2d');

            // Fill the background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Add Name and Register No
            ctx.fillStyle = '#000000';
            ctx.font = 'bold 30px Arial';
            ctx.fillText(name, 50, 100);
            ctx.font = '20px Arial';
            ctx.fillText(registerNo, 50, 150);

            // Load QR code data URL and draw it on the canvas
            const img = await loadImage(qrCodeData);
            ctx.drawImage(img, 50, 200, 300, 300);

            // Save the final card as an image
            const outputFilePath = `${outputDir}/${registerNo}_card.png`;
            const buffer = canvas.toBuffer('image/png');
            fs.writeFileSync(outputFilePath, buffer);
            console.log(`QR Card generated: ${outputFilePath}`);
        }
    } finally {
        // Close MongoDB connection
        await client.close();
    }
}

// Function to read data from Excel and insert it into MongoDB
// Function to read data from Excel and insert it into MongoDB
async function storeDataInMongo(inputFile) {
    const workbook = XLSX.readFile(inputFile);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);

    const client = new MongoClient(uri);

    try {
        // Connect to MongoDB
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection(collectionName);

        // Insert each entry into MongoDB after hashing the data
        for (const entry of data) {
            const { name, registerNo } = entry;
            const hashedData = hashData(`${name}${registerNo}`);

            await collection.insertOne({
                name: name,
                registerNo: registerNo,
                hashedData: hashedData,
                inTime: null,  // Added inTime field
                outTime: null  // Added outTime field
            });
            console.log(`Data inserted for ${name} with register number ${registerNo}`);
        }
    } finally {
        // Close MongoDB connection
        await client.close();
    }
}


// Specify the input file and output directory
const inputFile = 'input.xlsx'; // Replace with your input Excel/CSV file
const outputDir = './output'; // Directory to save the generated QR cards

// Process the data: Store in MongoDB, then generate QR cards
storeDataInMongo(inputFile)
    .then(() => generateQRCardsFromMongo(outputDir))
    .then(() => console.log('QR cards generation completed.'))
    .catch(err => console.error('Error:', err));
