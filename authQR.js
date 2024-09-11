const express = require('express');
const { MongoClient } = require('mongodb');
const QrCode = require('qrcode-reader');
const Jimp = require('jimp');
const fs = require('fs');
const bodyParser = require('body-parser');
require('dotenv').config();

// MongoDB connection URI
const uri = process.env.CONNECTION_URI; // Replace with your MongoDB URI
const dbName = 'qrCodeDB';
const collectionName = 'userData';

const app = express();
app.use(bodyParser.json({ limit: '10mb' })); // Limit size for base64 image

// Function to decode QR code from image buffer
async function decodeQRCode(imageBuffer) {
    return new Promise((resolve, reject) => {
        Jimp.read(imageBuffer)
            .then(image => {
                const qr = new QrCode();
                qr.callback = (error, value) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(value.result);
                    }
                };
                qr.decode(image.bitmap);
            })
            .catch(err => reject(err));
    });
}

// API endpoint to verify QR code
app.post('/verify-qr', async (req, res) => {
    const { imagePath, base64Image } = req.body;
    const client = new MongoClient(uri);

    try {
        let imageBuffer;

        if (imagePath) {
            // Read image from the provided file path
            imageBuffer = fs.readFileSync(imagePath);
        } else if (base64Image) {
            // Decode base64 image data
            const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
            imageBuffer = Buffer.from(base64Data, 'base64');
        } else {
            return res.status(400).json({ message: 'No image data provided' });
        }

        // Decode the QR code from the image
        const qrCodeData = await decodeQRCode(imageBuffer);
        console.log('Decoded QR code data:', qrCodeData);

        // Connect to MongoDB
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection(collectionName);

        // Search for a user with the matching hashed data
        const user = await collection.findOne({ hashedData: qrCodeData });

        if (user) {
            res.json({
                message: 'Match found in database!',
                user: {
                    name: user.name,
                    registerNo: user.registerNo
                }
            });
        } else {
            res.json({ message: 'No matching user found in the database.' });
        }
    } catch (err) {
        console.error('Error:', err);
        res.status(500).json({ message: 'An error occurred during verification.' });
    } finally {
        // Close MongoDB connection
        await client.close();
    }
});

app.get('/get-user', async (req, res) => {
    const { qrData } = req.query;
    console.log('Decoded QR code data:', qrData);
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection(collectionName);

        // Find the user with the corresponding qrData
        const user = await collection.findOne({ hashedData: qrData });

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({
            success: true,
            name: user.name,
            registerNo: user.registerNo,
            status: user.inTime ? (user.outTime ? 'OUT' : 'IN') : 'N/A',
            inTime: user.inTime,
            outTime: user.outTime
        });
    } catch (error) {
        console.error('Error fetching user data:', error);
        res.status(500).json({ success: false, message: 'An error occurred during fetching user data.' });
    } finally {
        await client.close();
    }
});


app.post('/mark-in-out', async (req, res) => {
    const { qrData, action } = req.body;
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection(collectionName);

        const user = await collection.findOne({ hashedData: qrData });

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const currentTime = new Date();

        if (action === 'in') {
            if (user.inTime && !user.outTime) {
                return res.json({ success: false, message: 'Already marked as in. Mark out before marking in again.' });
            }
            await collection.updateOne({ _id: user._id }, { $set: { inTime: currentTime, outTime: null } });
            return res.json({ success: true, message: 'Marked in successfully' });
        }

        if (action === 'out') {
            if (!user.inTime) {
                return res.json({ success: false, message: 'Cannot mark out without marking in first.' });
            }
            if (user.outTime) {
                return res.json({ success: false, message: 'Already marked out. Mark in before marking out again.' });
            }
            await collection.updateOne({ _id: user._id }, { $set: { outTime: currentTime } });
            return res.json({ success: true, message: 'Marked out successfully' });
        }

        res.status(400).json({ success: false, message: 'Invalid action' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'An error occurred during marking in/out.' });
    } finally {
        await client.close();
    }
});


// Start the server
const port = 3000;
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});