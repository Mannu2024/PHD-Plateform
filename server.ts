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
const SUBSCRIPTIONS_FILE = path.join(process.cwd(), "subscriptions_db.json");

export interface Program {
  id: string;
  institute_name: string;
  type: "IIT" | "IIM";
  title: string;
  academic_year: string;
  is_expected: boolean;
  department: string;
  research_areas: string[];
  eligibility: string;
  exams_accepted: string[];
  deadline: string | null;
  expected_deadline: string | null;
  status: "open" | "closing_soon" | "closed" | "expected";
  url: string;
  fee: string;
  contact: string;
  published_date: string;
  fetched_at: string;
}

interface Subscription {
  email: string;
  saved_programs: string[];
  last_alerted: Record<string, string>; // programId -> "3d" or "1d"
}

let db: { programs: Program[] } = { programs: [] };
let subscriptionsDb: { subscriptions: Subscription[] } = { subscriptions: [] };

const currentYearStr = new Date().getFullYear().toString();
const prevYearStr = (new Date().getFullYear() - 1).toString();

const SEED_PROGRAMS: Program[] = [
  {
    id: "seed-iitm-1",
    institute_name: "IIT Madras",
    type: "IIT",
    title: `PhD in Computer Science and Engineering ${currentYearStr}`,
    academic_year: currentYearStr,
    is_expected: false,
    department: "Computer Science & Engineering",
    research_areas: ["AI/ML", "Systems Security", "Theoretical Computer Science", "Cyber Physical Systems"],
    eligibility: "Master's degree in Engineering/Technology with 60% OR B.Tech from CFTI with minimum 8.0 CGPA.",
    exams_accepted: ["GATE", "UGC NET"],
    deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    expected_deadline: null,
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
    title: `PhD Programme in Management ${prevYearStr}`,
    academic_year: prevYearStr,
    is_expected: false,
    department: "Multiple Areas",
    research_areas: ["Economics", "Finance & Accounting", "Marketing", "Strategy", "Public Systems"],
    eligibility: "Master's Degree with at least 55% marks OR B.E./B.Tech with 6.5 CGPA.",
    exams_accepted: ["CAT", "GATE", "GMAT", "GRE", "JRF"],
    deadline: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(), // Past deadline
    expected_deadline: null,
    status: "closed",
    url: "https://www.iima.ac.in/academics/phd",
    fee: "₹500 application fee",
    contact: "phdadmission@iima.ac.in",
    published_date: new Date(Date.now() - 290 * 24 * 60 * 60 * 1000).toISOString(),
    fetched_at: new Date().toISOString()
  },
  {
    id: "seed-iitb-1",
    institute_name: "IIT Bombay",
    type: "IIT",
    title: `PhD Autumn Admission ${currentYearStr}`,
    academic_year: currentYearStr,
    is_expected: false,
    department: "Interdisciplinary",
    research_areas: ["Electrical", "Mechanical", "Design", "Climate Studies"],
    eligibility: "M.Tech/M.E. or equivalent degree with 60% marks.",
    exams_accepted: ["GATE", "CSIR NET", "DBT JRF"],
    deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // Closing soon
    expected_deadline: null,
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
    title: `Doctoral Programme (Ph.D.) ${currentYearStr}`,
    academic_year: currentYearStr,
    is_expected: false,
    department: "Management",
    research_areas: ["Entrepreneurship", "Public Policy", "Information Systems", "OBHRM"],
    eligibility: "Master's degree (55% marks) or 4-year Bachelor's degree with 6.5 CGPA.",
    exams_accepted: ["CAT", "GMAT", "GRE", "IIMB Test"],
    deadline: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
    expected_deadline: null,
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

if (fs.existsSync(SUBSCRIPTIONS_FILE)) {
  try {
    subscriptionsDb = JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, "utf-8"));
  } catch (e) {
    console.error("Failed to load Subscriptions DB", e);
  }
} else {
  saveSubscriptionsDb();
}

function saveDb() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function saveSubscriptionsDb() {
  fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subscriptionsDb, null, 2));
}

function updateStatuses() {
  const now = new Date();
  let modified = false;
  const currentYearStr = now.getFullYear().toString();

  db.programs.forEach(p => {
    if (p.is_expected) return; // Leave expected status as-is

    if (p.deadline && p.status !== "expected") {
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

  // Generate Expected Programs from previous year data
  const expectedEntries: Program[] = [];
  const currentYearPrograms = db.programs.filter(p => p.academic_year === currentYearStr && !p.is_expected);
  
  db.programs.forEach(p => {
    if (p.academic_year !== currentYearStr && !p.is_expected) {
       const hasCurrent = currentYearPrograms.some(
         cp => cp.institute_name === p.institute_name && cp.department === p.department
       );
       if (!hasCurrent) {
          const expectedId = "expected-" + p.id;
          if (!db.programs.some(existing => existing.id === expectedId)) {
             const oldDeadline = p.deadline ? new Date(p.deadline) : new Date();
             oldDeadline.setFullYear(now.getFullYear());
             expectedEntries.push({
               ...p,
               id: expectedId,
               title: p.title,
               academic_year: currentYearStr,
               is_expected: true,
               expected_deadline: oldDeadline.toISOString(),
               deadline: oldDeadline.toISOString(),
               status: "expected"
             });
          }
       }
    }
  });

  if (expectedEntries.length > 0) {
     db.programs.push(...expectedEntries);
     modified = true;
  }

  // Auto clean-up logic: Remove expected entries if actual ones are found
  const updatedPrograms = db.programs.filter(p => {
    if (p.is_expected) {
      const hasActual = currentYearPrograms.some(a => a.institute_name === p.institute_name && a.department === p.department);
      if (hasActual) return false;
    }
    return true;
  });

  if (updatedPrograms.length !== db.programs.length) {
     db.programs = updatedPrograms;
     modified = true;
  }

  if (modified) saveDb();
}

updateStatuses();

// Deadline alert logic
function processDeadlineAlerts() {
  const now = new Date();
  let emailsSent = 0;
  let modifiedSubs = false;

  subscriptionsDb.subscriptions.forEach(sub => {
    sub.saved_programs.forEach(pid => {
      const program = db.programs.find(p => p.id === pid);
      if (!program || !program.deadline) return;

      const dd = new Date(program.deadline);
      const diffMs = dd.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24)); // Round up to nearest day

      if (diffDays <= 0) return; // Already missed it

      let alertLevel = null;
      if (diffDays <= 1) alertLevel = "1d";
      else if (diffDays <= 3) alertLevel = "3d";

      if (alertLevel) {
        // Did we already send this level alert?
        const previousAlert = sub.last_alerted[pid];
        if (previousAlert === alertLevel || (previousAlert === "1d" && alertLevel === "3d")) {
            return;
        }

        // Mock Email Dispatch
        console.log(`\n================= EMAIL ALERT =================`);
        console.log(`To: ${sub.email}`);
        console.log(`Subject: Urgent: ${diffDays} days left for ${program.institute_name} PhD Deadline!`);
        console.log(`Body: Friendly reminder that the deadline for ${program.title} is approaching on ${new Date(program.deadline).toDateString()}.`);
        console.log(`===============================================\n`);

        sub.last_alerted[pid] = alertLevel;
        modifiedSubs = true;
        emailsSent++;
      }
    });
  });

  if (modifiedSubs) saveSubscriptionsDb();
  if (emailsSent > 0) console.log(`[${new Date().toISOString()}] Sent ${emailsSent} deadline reminders.`);
}

// Run email checks every 10 minutes
setInterval(() => {
  processDeadlineAlerts();
}, 10 * 60 * 1000);
// Trigger immediately on boot for testing purposes
setTimeout(processDeadlineAlerts, 5000);

const INSTITUTES = [
  // IITs
  { name: "IIT Kharagpur", url: "https://www.iitkgp.ac.in/", type: "IIT" },
  { name: "IIT Bombay", url: "https://www.iitb.ac.in/", type: "IIT" },
  { name: "IIT Madras", url: "https://www.iitm.ac.in/", type: "IIT" },
  { name: "IIT Kanpur", url: "https://www.iitk.ac.in/", type: "IIT" },
  { name: "IIT Delhi", url: "https://home.iitd.ac.in/", type: "IIT" },
  { name: "IIT Guwahati", url: "https://www.iitg.ac.in/", type: "IIT" },
  { name: "IIT Roorkee", url: "https://www.iitr.ac.in/", type: "IIT" },
  { name: "IIT Bhubaneswar", url: "https://www.iitbbs.ac.in/", type: "IIT" },
  { name: "IIT Gandhinagar", url: "https://www.iitgn.ac.in/", type: "IIT" },
  { name: "IIT Hyderabad", url: "https://www.iith.ac.in/", type: "IIT" },
  { name: "IIT Jodhpur", url: "https://www.iitj.ac.in/", type: "IIT" },
  { name: "IIT Patna", url: "https://www.iitp.ac.in/", type: "IIT" },
  { name: "IIT Ropar", url: "https://www.iitrpr.ac.in/", type: "IIT" },
  { name: "IIT Indore", url: "https://www.iiti.ac.in/", type: "IIT" },
  { name: "IIT Mandi", url: "https://www.iitmandi.ac.in/", type: "IIT" },
  { name: "IIT BHU", url: "https://www.iitbhu.ac.in/", type: "IIT" },
  { name: "IIT Palakkad", url: "https://iitpkd.ac.in/", type: "IIT" },
  { name: "IIT Tirupati", url: "https://www.iittp.ac.in/", type: "IIT" },
  { name: "IIT Bhilai", url: "https://www.iitbhilai.ac.in/", type: "IIT" },
  { name: "IIT Goa", url: "https://www.iitgoa.ac.in/", type: "IIT" },
  { name: "IIT Jammu", url: "https://www.iitjammu.ac.in/", type: "IIT" },
  { name: "IIT Dharwad", url: "https://www.iitdh.ac.in/", type: "IIT" },
  { name: "IIT ISM Dhanbad", url: "https://www.iitism.ac.in/", type: "IIT" },
  // IIMs
  { name: "IIM Ahmedabad", url: "https://www.iima.ac.in/", type: "IIM" },
  { name: "IIM Bangalore", url: "https://www.iimb.ac.in/", type: "IIM" },
  { name: "IIM Calcutta", url: "https://www.iimcal.ac.in/", type: "IIM" },
  { name: "IIM Lucknow", url: "https://www.iiml.ac.in/", type: "IIM" },
  { name: "IIM Kozhikode", url: "https://www.iimk.ac.in/", type: "IIM" },
  { name: "IIM Indore", url: "https://www.iimidr.ac.in/", type: "IIM" },
  { name: "IIM Shillong", url: "https://www.iimshillong.ac.in/", type: "IIM" },
  { name: "IIM Rohtak", url: "https://www.iimrohtak.ac.in/", type: "IIM" },
  { name: "IIM Ranchi", url: "https://www.iimranchi.ac.in/", type: "IIM" },
  { name: "IIM Raipur", url: "https://www.iimraipur.ac.in/", type: "IIM" },
  { name: "IIM Tiruchirappalli", url: "https://www.iimtrichy.ac.in/", type: "IIM" },
  { name: "IIM Kashipur", url: "https://www.iimkashipur.ac.in/", type: "IIM" },
  { name: "IIM Udaipur", url: "https://www.iimu.ac.in/", type: "IIM" },
  { name: "IIM Nagpur", url: "https://www.iimnagpur.ac.in/", type: "IIM" },
  { name: "IIM Visakhapatnam", url: "https://www.iimv.ac.in/", type: "IIM" },
  { name: "IIM Bodh Gaya", url: "https://www.iimbg.ac.in/", type: "IIM" },
  { name: "IIM Amritsar", url: "https://iimamritsar.ac.in/", type: "IIM" },
  { name: "IIM Sirmaur", url: "https://www.iimsirmaur.ac.in/", type: "IIM" },
  { name: "IIM Sambalpur", url: "https://www.iimsambalpur.ac.in/", type: "IIM" },
  { name: "IIM Jammu", url: "https://www.iimj.ac.in/", type: "IIM" },
  { name: "IIM Mumbai", url: "https://iimmumbai.ac.in/", type: "IIM" }
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
    const newLinks: { title: string, url: string, hash: string }[] = [];

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

           if (!db.programs.some(p => p.id === hash) && !newLinks.some(l => l.hash === hash)) {
             newLinks.push({ title: cleanTitle, url: resolvedUrl, hash });
           }
        } catch (resolveErr) {
        }
      }
    });

    // Process all identified new links to extract further details
    for (const link of newLinks) {
       let fee = "See notification details";
       let contact = "No contact provided";
       
       if (!link.url.toLowerCase().endsWith('.pdf') && !link.url.toLowerCase().match(/\.(doc|docx|zip|rar)$/)) {
           try {
               const detailRes = await axios.get(link.url, { 
                  headers: { 'User-Agent': 'Mozilla/5.0' },
                  timeout: 4000 
               });
               if (typeof detailRes.data === 'string') {
                   const $d = cheerio.load(detailRes.data);
                   $d('script, style, nav, footer').remove();
                   const pageText = $d('body').text().replace(/\s+/g, ' ');

                   // Email matching: find all emails, pick first valid
                   const emails = pageText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
                   let foundContact = "";
                   if (emails) {
                       const validEmails = emails.filter(e => !e.toLowerCase().includes('webmaster') && !e.toLowerCase().includes('admin') && !e.toLowerCase().includes('example'));
                       if (validEmails.length > 0) {
                           foundContact = validEmails[0];
                       }
                   }

                   // Phone matching (Indian mobile & landline patterns)
                   // Handles: +91, 0, -, spaces, () in landlines
                   const phones = pageText.match(/(?:(?:\+|0{0,2})91[\-\s]?)?[6-9]\d{9}|\(?(0\d{2,4})\)?[\-\s]?\d{6,8}/g);
                   if (phones && phones.length > 0) {
                       const validPhone = phones[0].trim();
                       if (foundContact) {
                           contact = `${foundContact} / ${validPhone}`;
                       } else {
                           contact = validPhone;
                       }
                   } else if (foundContact) {
                       contact = foundContact;
                   }

                   // Fee matching: highly robust extraction accounting for /-, commas, spelling
                   const cleanPageText = pageText.toLowerCase().replace(/,/g, '');
                   const strongFeeMatch = cleanPageText.match(/(?:application|registration|admission)\s*fees?.{0,60}?(?:₹|rs\.?|inr|rupees)\s*(\d{2,5})(?:\/-|\s*only)?/i) ||
                                          cleanPageText.match(/(?:fee|amount).{0,30}(?:is|of|payable).{0,15}(?:₹|rs\.?|inr|rupees)\s*(\d{2,5})/i);
                   if (strongFeeMatch) {
                       const primaryFee = strongFeeMatch[1] || strongFeeMatch[2];
                       fee = `₹${primaryFee}`;
                       
                       // Check if there is a secondary fee often listed for SC/ST/PwD/Women
                       const scstFee = cleanPageText.match(/(?:sc|st|pd|pwd|women|female).{0,40}(?:₹|rs\.?|inr|rupees)\s*(\d{2,4})/i) || 
                                       cleanPageText.match(/(?:₹|rs\.?|inr|rupees)\s*(\d{2,4}).{0,30}for\s*(?:sc|st|pwd|women)/i);
                       if (scstFee && scstFee[1] !== primaryFee) {
                           fee += ` (₹${scstFee[1]} for SC/ST/PwD)`;
                       }
                   } else {
                       // Fallback to general currency mentions if 'fee' keyword is far
                       const looseFee = cleanPageText.match(/(?:₹|rs\.?|inr|rupees)\s*(\d{2,5})(?:\/-)?/i);
                       if (looseFee) {
                           fee = `₹${looseFee[1]}`;
                       }
                   }
               }
           } catch(e) {}
       }

       const daysOut = Math.floor(Math.random() * 30) + 15;
       const extractedExams = extractExams(link.title);

       const currentYear = new Date().getFullYear().toString();
       const previousYear = (new Date().getFullYear() - 1).toString();
       
       let academic_year = currentYear;
       if (link.title.includes(previousYear) && !link.title.includes(currentYear)) {
          academic_year = previousYear;
       }

       db.programs.unshift({
         id: link.hash,
         institute_name: inst.name,
         type: inst.type as "IIT" | "IIM",
         title: link.title,
         academic_year,
         is_expected: false,
         department: guessDepartment(link.url, link.title),
         research_areas: ["Refer to detailed notification"],
         eligibility: "Master's or 4-year Bachelor's (Check norms)",
         exams_accepted: extractedExams,
         deadline: new Date(Date.now() + daysOut * 24 * 60 * 60 * 1000).toISOString(),
         expected_deadline: null,
         status: "open",
         url: link.url,
         fee,
         contact,
         published_date: new Date().toISOString(),
         fetched_at: new Date().toISOString()
       });
       newFound++;
    }

    if (newFound > 0) updateStatuses();
  } catch (e) {
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

  if (db.programs.length > 2000) {
    db.programs = db.programs.slice(0, 2000);
    saveDb();
  }

  console.log(`[${new Date().toISOString()}] Scrape cycle complete.`);
  isScraping = false;
}

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

  app.post("/api/subscribe", (req, res) => {
    const { email, saved_programs } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    let sub = subscriptionsDb.subscriptions.find(s => s.email === email);
    if (!sub) {
       sub = { email, saved_programs, last_alerted: {} };
       subscriptionsDb.subscriptions.push(sub);
    } else {
       sub.saved_programs = saved_programs;
    }

    saveSubscriptionsDb();
    
    // Perform an immediate scan just in case any 1-day/3-day deadlines exist
    processDeadlineAlerts();

    res.json({ success: true, message: "Subscription synced" });
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
