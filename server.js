const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'cards.json');

app.use(cors());
app.use(express.json());

function loadCards() {
    if (!fs.existsSync(DATA_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
        return [];
    }
}

function saveCards(cards) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(cards, null, 2), 'utf8');
}

// Ár lekérdezése közvetlenül a megadott Cardmarket URL-ről
async function fetchPriceFromLink(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        // Cardmarket ár elemzése a termékoldalról
        let priceText = $('.price-container .item-price').first().text().trim();
        if (!priceText) {
            priceText = $('dd.price-container').first().text().trim();
        }
        
        if (priceText) {
            const cleanPrice = parseFloat(priceText.replace('€', '').replace(',', '.').trim());
            return isNaN(cleanPrice) ? 0.00 : cleanPrice;
        }
        return 0.00;
    } catch (error) {
        console.error(`Hiba a link lekérdezésekor (${url}):`, error.message);
        return null;
    }
}

// Kártyák listázása
app.get('/api/cards', (req, res) => {
    res.json(loadCards());
});

// Új kártya hozzáadása és azonnali árlekérdezés
app.post('/api/cards', async (req, res) => {
    const { name, quantity, condition, link } = req.body;
    if (!name || !link) return res.status(400).json({ error: 'A név és a link megadása kötelező!' });

    const cards = loadCards();
    console.log(`Új kártya hozzáadása és árazása: ${name}...`);
    const currentPrice = await fetchPriceFromLink(link);

    const newCard = {
        id: Date.now().toString(),
        name,
        quantity: parseInt(quantity) || 1,
        condition: condition || 'Near Mint',
        link,
        price: currentPrice !== null ? currentPrice : 0.00,
        lastUpdated: new Date().toISOString()
    };

    cards.push(newCard);
    saveCards(cards);
    res.json(newCard);
});

// TELJES AUTOMATIKUS FRISSÍTÉS: Végigmegy az összes mentett linken és frissíti az árakat
app.post('/api/update-prices', async (req, res) => {
    const cards = loadCards();
    let updatedCount = 0;

    for (let card of cards) {
        if (card.link) {
            const freshPrice = await fetchPriceFromLink(card.link);
            if (freshPrice !== null && freshPrice > 0) {
                card.price = freshPrice;
                card.lastUpdated = new Date().toISOString();
                updatedCount++;
            }
            // Kis várakozás kérések között, hogy a Cardmarket ne tiltsa le a szervert
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    saveCards(cards);
    res.json({ success: true, updatedCount });
});

// Kártya törlése
app.delete('/api/cards/:id', (req, res) => {
    let cards = loadCards();
    cards = cards.filter(c => c.id !== req.params.id);
    saveCards(cards);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Háttérszerver fut a ${PORT}-es porton`);
});