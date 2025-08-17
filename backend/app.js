import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import 'dotenv/config';
import OpenAI from 'openai';

const app = express();
const port = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(cors());
app.use(bodyParser.json());

app.post('/analyze', async (req, res) => {
  const { campaignName, impressions, clicks, cpc, ctr, spend, purchases, roas, addToCart, country, objective, platform } = req.body;

  const prompt = `
You are an expert digital marketing analyst. Analyze the performance of this ${platform} advertising campaign for ${country}. The objective was ${objective}. Use the following metrics:

Campaign Name: ${campaignName}
Impressions: ${impressions}
Clicks: ${clicks}
CPC: ${cpc}
CTR: ${ctr}
Spend: ${spend}
Purchases: ${purchases}
ROAS: ${roas}
Add to Carts: ${addToCart}

Give a concise but insightful report. Structure the output like this:

1. Campaign Overview
2. Performance Summary
3. Key Insights
4. Recommendations & Next Steps
`;

  try {
    const completion = await openai.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'gpt-4'
    });

    res.json({ result: completion.choices[0].message.content });
  } catch (error) {
    console.error('Error generating analysis:', error);
    res.status(500).json({ error: 'Failed to generate analysis' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
