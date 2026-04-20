import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";
import { fileURLToPath } from "url";
import fs from "fs";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_FILE = path.join(process.cwd(), "programs_db.json");

export interface Program {
  id: string;
  institute_name: string;
  type: "IIT" | "IIM";
  title: string;
  department: string;
  research_areas: string[];
  eligibility: string;
  exams_accepted: string[];
  deadline: string | null;
  status: "open" | "closing_soon" | "closed";
  url: string;
  fee: string;
  contact: string;
  published_date: string;
  fetched_at: string;
}

let db: { programs: Program[] } = { programs: [] };

const SEED_PROGRAMS: Program[] = [
  {
    id: "seed-iitm-1",
    institute_name: "IIT Madras",
    type: "IIT",
    title: "PhD in Computer Science and Engineering",
    department: "Computer Science & Engineering",
    research_areas: ["AI/ML", "Systems Security", "Theoretical Computer Science", "Cyber Physical Systems"],
    eligibility: "Master's degree in Engineering/Technology with 60% OR B.Tech from CFTI with minimum 8.0 CGPA.",
    exams_accepted: ["GATE", "UGC NET"],
    deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    status: "open",
    url: "https://www.iitm.ac.in/academics/research",
    fee: "₹1000 for Gen/OBC, ₹500 for SC/ST",
    contact: "resadmission@iitm.ac.in",
    published_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    fetched_at: new Date().toISOString()
  },
  {
    id: "seed-iima-1",
    institute_name: "IIM Ahmedabad",
    type: "IIM",
    title: "PhD Programme in Management",
    department: "Multiple Areas",
    research_areas: ["Economics", "Finance & Accounting", "Marketing", "Strategy", "Public Systems"],
    eligibility: "Master's Degree with at least 55% marks OR B.E./B.Tech with 6.5 CGPA.",
    exams_accepted: ["CAT", "GATE", "GMAT", "GRE", "JRF"],
    deadline: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(), // Past deadline
    status: "closed",
    url: "https://www.iima.ac.in/academics/phd",
    fee: "₹500 application fee",
    contact: "phdadmission@iima.ac.in",
    published_date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    fetched_at: new Date().toISOString()
  },
  {
    id: "seed-iitb-1",
    institute_name: "IIT Bombay",
    type: "IIT",
    title: "PhD Autumn Admission 2026",
    department: "Interdisciplinary",
    research_areas: ["Electrical", "Mechanical", "Design", "Climate Studies"],
    eligibility: "M.Tech/M.E. or equivalent degree with 60% marks.",
    exams_accepted: ["GATE", "CSIR NET", "DBT JRF"],
    deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // Closing soon
    status: "closing_soon",
    url: "https://www.iitb.ac.in/admissions",
    fee: "₹1500 Gen/OBC, ₹750 SC/ST/Women",
    contact: "pgadm@iitb.ac.in",
    published_date: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
    fetched_at: new Date().toISOString()
  },
  {
    id: "seed-iimb-1",
    institute_name: "IIM Bangalore",
    type: "IIM",
    title: "Doctoral Programme (Ph.D.) 2026",
    department: "Management",
    research_areas: ["Entrepreneurship", "Public Policy", "Information Systems", "OBHRM"],
    eligibility: "Master's degree (55% marks) or 4-year Bachelor's degree with 6.5 CGPA.",
    exams_accepted: ["CAT", "GMAT", "GRE", "IIMB Test"],
    deadline: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
    status: "open",
    url: "https://www.iimb.ac.in/programmes/phd",
    fee: "₹1000 Application Fee",
    contact: "phdadm@iimb.ac.in",
    published_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    fetched_at: new Date().toISOString()
  }
];

if (fs.existsSync(DB_FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
  } catch (e) {
    console.error("Failed to load DB", e);
  }
} else {
  db.programs = [...SEED_PROGRAMS];
  saveDb();
}

// Function to update statuses dynamically based on deadlines
function updateStatuses() {
  const now = new Date();
  let modified = false;

  db.programs.forEach(p => {
    if (p.deadline) {
      const dd = new Date(p.deadline);
      const diffMs = dd.getTime() - now.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      let newStatus: Program["status"] = p.status;

      if (diffDays <= 0) {
        newStatus = "closed";
      } else if (diffDays <= 7) {
        newStatus = "closing_soon";
      } else {
        newStatus = "open";
      }

      if (newStatus !== p.status) {
        p.status = newStatus;
        modified = true;
      }
    }
  });

  if (modified) saveDb();
}

// Ensure statuses are updated on load
updateStatuses();

function saveDb() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

const INSTITUTES = [
  // Shortened list for real-time scraping
  { name: "IIT Kharagpur", url: "https://www.iitkgp.ac.in/", type: "IIT" },
  { name: "IIT Bombay", url: "https://www.iitb.ac.in/", type: "IIT" },
  { name: "IIT Delhi", url: "https://home.iitd.ac.in/", type: "IIT" },
  { name: "IIT Madras", url: "https://www.iitm.ac.in/", type: "IIT" },
  { name: "IIT Kanpur", url: "https://www.iitk.ac.in/", type: "IIT" },
  { name: "IIM Ahmedabad", url: "https://www.iima.ac.in/", type: "IIM" },
  { name: "IIM Bangalore", url: "https://www.iimb.ac.in/", type: "IIM" },
  { name: "IIM Calcutta", url: "https://www.iimcal.ac.in/", type: "IIM" }
];

const SUFFIXES = ["", "admissions", "phd", "research", "notices", "announcements"];
const KEYWORDS = ["phd", "doctoral", "ph.d", "research admission", "fellowship"];
const EXCLUDE = ["event", "tender", "placement"];

let isScraping = false;

function extractExams(text: string): string[] {
  const exams: string[] = [];
  const upper = text.toUpperCase();
  if (upper.includes("GATE")) exams.push("GATE");
  if (upper.includes("NET") || upper.includes("JRF")) exams.push("UGC NET/JRF");
  if (upper.includes("CAT")) exams.push("CAT");
  if (upper.includes("GMAT") || upper.includes("GRE")) exams.push("GMAT/GRE");
  if (upper.includes("CSIR")) exams.push("CSIR NET");
  
  return exams.length > 0 ? exams : ["Institute Exam / Interview (See rules)"];
}

function guessDepartment(url: string, title: string): string {
  const text = (url + " " + title).toLowerCase();
  if (text.includes("cse") || text.includes("computer")) return "Computer Science";
  if (text.includes("ee") || text.includes("electrical")) return "Electrical Eng.";
  if (text.includes("me") || text.includes("mechanical")) return "Mechanical Eng.";
  if (text.includes("civil")) return "Civil Eng.";
  if (text.includes("manage") || text.includes("business")) return "Management";
  if (text.includes("eco")) return "Economics";
  if (text.includes("math")) return "Mathematics";
  return "Interdisciplinary / Open";
}

async function scrapePage(inst: typeof INSTITUTES[0], targetUrl: string) {
  try {
    const res = await axios.get(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 8000
    });

    const $ = cheerio.load(res.data);
    let newFound = 0;

    $('a').each((_, el) => {
      let text = $(el).text().replace(/\s+/g, ' ').trim();
      let href = $(el).attr('href');
      
      const titleAttr = $(el).attr('title');
      if (!text && titleAttr) text = titleAttr.trim();

      if (!text || !href) return;
      if (href.startsWith("javascript:") || href.startsWith("mailto:")) return;

      const lowerText = text.toLowerCase();
      const lowerHref = href.toLowerCase();

      const hasKeyword = KEYWORDS.some(kw => lowerText.includes(kw) || lowerHref.includes(kw));
      const hasExclude = EXCLUDE.some(ex => lowerText.includes(ex) || lowerHref.includes(ex));

      if (hasKeyword && !hasExclude) {
        try {
           const resolvedUrl = new URL(href, targetUrl).toString();
           const cleanTitle = text.length > 150 ? text.substring(0, 150) + "..." : text;
           const hash = crypto.createHash('md5').update(resolvedUrl + cleanTitle).digest('hex');

           if (!db.programs.some(p => p.id === hash)) {
             // Mock structured extraction for scraped items
             // Since we can't fully parse the inner page, we extract hints
             
             // Give a random future deadline (15 to 45 days) for visual demo purposes
             const daysOut = Math.floor(Math.random() * 30) + 15;
             
             const extractedExams = extractExams(cleanTitle);

             db.programs.unshift({
               id: hash,
               institute_name: inst.name,
               type: inst.type as "IIT" | "IIM",
               title: cleanTitle,
               department: guessDepartment(resolvedUrl, cleanTitle),
               research_areas: ["Refer to detailed notification"],
               eligibility: "Master's or 4-year Bachelor's (Check norms)",
               exams_accepted: extractedExams,
               deadline: new Date(Date.now() + daysOut * 24 * 60 * 60 * 1000).toISOString(),
               status: "open", // Automatically set logic runs later
               url: resolvedUrl,
               fee: "See notification details",
               contact: "No contact provided",
               published_date: new Date().toISOString(),
               fetched_at: new Date().toISOString()
             });
             newFound++;
           }
        } catch (resolveErr) {
           // Skip if URL is malformed
        }
      }
    });

    if (newFound > 0) {
      updateStatuses(); // This also saves the DB
    }
  } catch (e) {
    // Silent fail for scraper
  }
}

async function runScrapeCycle() {
  if (isScraping) return;
  isScraping = true;
  console.log(`[${new Date().toISOString()}] Starting aggregate scrape cycle...`);

  updateStatuses();

  for (const inst of INSTITUTES) {
    for (const suffix of SUFFIXES) {
      let u = inst.url;
      if (suffix) {
        if (!u.endsWith('/')) u += '/';
        u += suffix;
      }
      await scrapePage(inst, u);
      await new Promise(r => setTimeout(r, 600)); 
    }
  }

  // Cap size
  if (db.programs.length > 2000) {
    db.programs = db.programs.slice(0, 2000);
    saveDb();
  }

  console.log(`[${new Date().toISOString()}] Scrape cycle complete.`);
  isScraping = false;
}

// Background scheduler
setTimeout(runScrapeCycle, 3000);
setInterval(runScrapeCycle, 15 * 60 * 1000);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/programs", (req, res) => {
    // Sort by status priority (closing_soon -> open -> closed) then by deadline
    const sorted = [...db.programs].sort((a, b) => {
      const statusWeight = { 'closing_soon': 1, 'open': 2, 'closed': 3 };
      if (statusWeight[a.status] !== statusWeight[b.status]) {
        return statusWeight[a.status] - statusWeight[b.status];
      }
      if (a.deadline && b.deadline) {
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      }
      return 0;
    });
    res.json(sorted);
  });

  app.post("/api/trigger-scrape", (req, res) => {
    if (isScraping) {
       return res.status(400).json({ error: "Scraping is already in progress" });
    }
    runScrapeCycle();
    res.json({ success: true, message: "Scrape cycle started" });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
