import { useEffect, useState } from "react";
import { Search, ExternalLink, RefreshCw, Filter, ShieldAlert, Bookmark, MapPin, Calendar, CheckCircle2, ChevronDown, ChevronUp, BellRing, Navigation, GraduationCap, Clock, X, AlertCircle } from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { cn } from "@/lib/utils";

interface Program {
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

export default function Home() {
  const currentYearStr = new Date().getFullYear().toString();
  const prevYearStr = (new Date().getFullYear() - 1).toString();

  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"All" | "IIT" | "IIM">("All");
  const [filterStatus, setFilterStatus] = useState<"All" | "open" | "closing_soon" | "closed" | "expected">("All");
  const [filterYear, setFilterYear] = useState<string>(currentYearStr);
  
  const [filterExams, setFilterExams] = useState<string[]>([]);
  const [filterDepts, setFilterDepts] = useState<string[]>([]);
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  
  // Alert system state
  const [emailAlerts, setEmailAlerts] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [submittingEmail, setSubmittingEmail] = useState(false);

  useEffect(() => {
    const loadedSaves = localStorage.getItem('savedPhdPrograms');
    if (loadedSaves) {
      setSavedIds(new Set(JSON.parse(loadedSaves)));
    }
    const savedEmail = localStorage.getItem('phdTrackrEmail');
    if (savedEmail) {
      setUserEmail(savedEmail);
      setEmailAlerts(true);
    }
    fetchPrograms();
  }, []);

  const syncSubscription = async (emailToSync: string, currentSaved: Set<string>) => {
    if (!emailToSync) return;
    try {
       await fetch("/api/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: emailToSync, saved_programs: Array.from(currentSaved) })
       });
    } catch(e) {
       console.error("Failed to sync subscription", e);
    }
  };

  const fetchPrograms = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/programs");
      const data = await res.json();
      setPrograms(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleTriggerScrape = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/trigger-scrape", { method: "POST" });
      if (res.ok) {
         setTimeout(fetchPrograms, 3000);
      }
    } catch (err) {
      console.error(err);
      setIsRefreshing(false);
    }
  };

  const toggleSave = (id: string) => {
    const newSaved = new Set(savedIds);
    if (newSaved.has(id)) newSaved.delete(id);
    else newSaved.add(id);
    
    setSavedIds(newSaved);
    localStorage.setItem('savedPhdPrograms', JSON.stringify(Array.from(newSaved)));
    
    if (emailAlerts && userEmail) {
      syncSubscription(userEmail, newSaved);
    }
  };

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!userEmail.includes("@")) return;

    setSubmittingEmail(true);
    await syncSubscription(userEmail, savedIds);
    localStorage.setItem('phdTrackrEmail', userEmail);
    setEmailAlerts(true);
    setSubmittingEmail(false);
    setShowEmailModal(false);
  };

  const handleToggleAlertsClick = () => {
    if (emailAlerts) {
       // Turn off
       setEmailAlerts(false);
       setUserEmail("");
       localStorage.removeItem('phdTrackrEmail');
       // In a real system, you'd also hit an unsubscribe endpoint here
    } else {
       setShowEmailModal(true);
    }
  };

  const uniqueExams = Array.from(new Set(programs.flatMap(p => p.exams_accepted))).sort();
  const uniqueDepts = Array.from(new Set(programs.map(p => p.department))).sort();

  const handleExamToggle = (exam: string) => {
    setFilterExams(prev => prev.includes(exam) ? prev.filter(e => e !== exam) : [...prev, exam]);
  };
  
  const handleDeptToggle = (dept: string) => {
    setFilterDepts(prev => prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]);
  };

  const filtered = programs.filter(p => {
    const matchYear = filterYear === "All" || p.academic_year === filterYear;
    const matchType = filterType === "All" || p.type === filterType;
    const matchStatus = filterStatus === "All" || p.status === filterStatus;
    const matchExam = filterExams.length === 0 || p.exams_accepted.some(ex => filterExams.includes(ex));
    const matchDept = filterDepts.length === 0 || filterDepts.includes(p.department);
    const matchSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        p.institute_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        p.department.toLowerCase().includes(searchTerm.toLowerCase());
    return matchYear && matchType && matchStatus && matchSearch && matchExam && matchDept;
  }).sort((a, b) => {
    // Priority: Current year > Expected > Previous year
    if (a.academic_year === currentYearStr && b.academic_year !== currentYearStr) return -1;
    if (b.academic_year === currentYearStr && a.academic_year !== currentYearStr) return 1;
    
    // Within same year group, sort by status then deadline
    const statusWeight = { 'closing_soon': 1, 'open': 2, 'expected': 3, 'closed': 4 };
    if (statusWeight[a.status] !== statusWeight[b.status]) {
      return statusWeight[a.status] - statusWeight[b.status];
    }
    
    if (a.deadline && b.deadline) {
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    }
    return 0;
  });

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans relative">
      
      {/* Email Subscription Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
           <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="p-6">
                 <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                       <div className="bg-indigo-100 p-2 rounded-full">
                         <BellRing className="h-6 w-6 text-indigo-600" />
                       </div>
                       <h3 className="text-xl font-bold text-gray-900">Get Deadline Alerts</h3>
                    </div>
                    <button onClick={() => setShowEmailModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                      <X className="h-5 w-5" />
                    </button>
                 </div>
                 <p className="text-gray-600 text-sm mb-6 leading-relaxed">
                   Enter your email below. We will send you an automatic reminder 3 days and 1 day before the deadline of any program you have saved (bookmarked).
                 </p>
                 <form onSubmit={handleSubscribe} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-600 uppercase tracking-widest mb-1.5">Email Address</label>
                      <input 
                        type="email" 
                        required
                        placeholder="e.g. aspirant@example.com"
                        value={userEmail}
                        onChange={e => setUserEmail(e.target.value)}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all"
                      />
                    </div>
                    <button 
                      type="submit"
                      disabled={submittingEmail}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      {submittingEmail ? <RefreshCw className="h-5 w-5 animate-spin" /> : "Subscribe & Turn On Alerts"}
                    </button>
                 </form>
              </div>
           </div>
        </div>
      )}

      {/* Navbar Spotlight */}
      <header className="bg-indigo-900 border-b border-indigo-800 text-white sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
             <div className="h-10 w-10 bg-indigo-500 rounded-lg flex items-center justify-center shadow-inner">
               <GraduationCap className="h-6 w-6 text-white" />
             </div>
             <div>
               <h1 className="text-xl font-bold tracking-tight">PhD Navigator</h1>
               <p className="text-[11px] text-indigo-300 font-medium tracking-widest uppercase">IIT & IIM Central Database</p>
             </div>
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
             <button 
               onClick={handleToggleAlertsClick}
               className={cn(
                 "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all border",
                 emailAlerts 
                   ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300" 
                   : "bg-white/10 hover:bg-white/20 text-indigo-100 border-transparent"
               )}
             >
               <BellRing className={cn("h-4 w-4", emailAlerts && "animate-pulse")} />
               {emailAlerts ? "Alerts Active" : "Get Alerts"}
             </button>
             
             <button 
               onClick={handleTriggerScrape}
               disabled={isRefreshing}
               className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-white px-4 py-1.5 rounded-full text-sm font-medium disabled:opacity-50 transition-colors shadow-sm"
             >
               <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
               Live Sync
             </button>
          </div>
        </div>
      </header>

      {/* Main App Canvas */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex flex-col lg:flex-row gap-6">
         
         {/* Left Sidebar Filters */}
         <aside className="w-full lg:w-72 shrink-0 space-y-6">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
               <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                 <Filter className="h-4 w-4 text-indigo-600" /> Smart Filters
               </h3>
               
               {/* Search */}
               <div className="mb-6 relative">
                 <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Search Programs</label>
                 <div className="relative">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                   <input 
                     type="text" 
                     placeholder="e.g. 'Computer Science'" 
                     value={searchTerm}
                     onChange={e => setSearchTerm(e.target.value)}
                     className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none"
                   />
                 </div>
               </div>

               {/* Academic Year */}
               <div className="mb-6">
                 <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Admission Timeline</label>
                 <div className="flex bg-gray-100 p-1 rounded-lg">
                   {["All", currentYearStr, prevYearStr].map(year => (
                     <button 
                       key={year}
                       onClick={() => setFilterYear(year)}
                       className={cn(
                         "flex-1 py-1.5 rounded-md text-sm font-medium transition-all",
                         filterYear === year 
                           ? "bg-white text-gray-900 shadow-sm" 
                           : "text-gray-500 hover:text-gray-700"
                       )}
                     >
                       {year === currentYearStr ? "Current Year" : year === prevYearStr ? "Previous Year" : "All Admissions"}
                     </button>
                   ))}
                 </div>
               </div>

               {/* Institute Type */}
               <div className="mb-6">
                 <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Institute Details</label>
                 <div className="flex bg-gray-100 p-1 rounded-lg">
                   {["All", "IIT", "IIM"].map(type => (
                     <button 
                       key={type}
                       onClick={() => setFilterType(type as any)}
                       className={cn(
                         "flex-1 py-1.5 rounded-md text-sm font-medium transition-all",
                         filterType === type 
                           ? "bg-white text-gray-900 shadow-sm" 
                           : "text-gray-500 hover:text-gray-700"
                       )}
                     >
                       {type}
                     </button>
                   ))}
                 </div>
               </div>

               {/* Application Status */}
               <div className="mb-6">
                 <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Timeline</label>
                 <div className="space-y-2">
                   {[
                     { id: "All", label: "Any Status" },
                     { id: "open", label: "Open Now", color: "bg-emerald-500" },
                     { id: "closing_soon", label: "Closing Soon (≤ 7 days)", color: "bg-amber-500" },
                     { id: "expected", label: "Expected (Predictive)", color: "bg-indigo-500" },
                     { id: "closed", label: "Closed", color: "bg-rose-500" }
                   ].map(st => (
                     <button
                       key={st.id}
                       onClick={() => setFilterStatus(st.id as any)}
                       className={cn(
                         "w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-sm transition-all",
                         filterStatus === st.id 
                           ? "bg-indigo-50 border-indigo-200 text-indigo-700 font-medium"
                           : "bg-white border-gray-100 text-gray-600 hover:bg-gray-50"
                       )}
                     >
                       {st.color && <span className={cn("w-2 h-2 rounded-full", st.color)} />}
                       {st.label}
                     </button>
                   ))}
                 </div>
               </div>

               {/* Discipline / Department Checkboxes */}
               <div className="mb-6">
                 <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Departments</label>
                 <div className="space-y-2.5 max-h-48 overflow-y-auto pr-2 pb-2">
                   {uniqueDepts.length === 0 && <span className="text-xs text-gray-400">Loading...</span>}
                   {uniqueDepts.map(dept => (
                     <label key={dept} className="flex items-start gap-2 cursor-pointer group">
                       <input 
                         type="checkbox" 
                         checked={filterDepts.includes(dept)}
                         onChange={() => handleDeptToggle(dept)}
                         className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                       />
                       <span className="text-sm text-gray-700 group-hover:text-indigo-700 leading-snug">{dept}</span>
                     </label>
                   ))}
                 </div>
               </div>

               {/* Exam Checkboxes */}
               <div>
                 <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Exams Accepted</label>
                 <div className="space-y-2.5 max-h-48 overflow-y-auto pr-2 pb-2">
                   {uniqueExams.length === 0 && <span className="text-xs text-gray-400">Loading...</span>}
                   {uniqueExams.map(ex => (
                     <label key={ex} className="flex items-start gap-2 cursor-pointer group">
                       <input 
                         type="checkbox" 
                         checked={filterExams.includes(ex)}
                         onChange={() => handleExamToggle(ex)}
                         className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                       />
                       <span className="text-sm text-gray-700 group-hover:text-indigo-700 leading-snug">{ex}</span>
                     </label>
                   ))}
                 </div>
               </div>
            </div>

            {/* Saved Programs Stat Widget */}
            <div className="bg-indigo-600 rounded-2xl p-5 text-white shadow-lg shadow-indigo-200 border border-indigo-500 relative overflow-hidden">
               <div className="absolute -right-4 -top-4 opacity-10">
                 <BellRing className="w-24 h-24 text-white" />
               </div>
               <div className="flex justify-between items-start mb-2 relative">
                  <Bookmark className="h-5 w-5 text-indigo-200 fill-indigo-200" />
                  <span className="text-2xl font-bold">{savedIds.size}</span>
               </div>
               <h4 className="font-semibold text-indigo-50 border-b border-indigo-500/50 pb-2 mb-2 relative">Watchlist</h4>
               <p className="text-indigo-200 text-xs leading-relaxed relative">
                 You are tracking {savedIds.size} applications. 
                 {!emailAlerts ? (
                    <span className="block mt-2 font-semibold text-indigo-100 cursor-pointer underline hover:text-white" onClick={() => setShowEmailModal(true)}>
                       Turn on alerts to prevent missing deadlines.
                    </span>
                 ) : (
                    <span className="block mt-2 font-semibold text-emerald-300 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Alerts are currently active.
                    </span>
                 )}
               </p>
            </div>
         </aside>

         {/* Results Grid / Feed */}
         <div className="flex-1">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                Found {filtered.length} Programs
              </h2>
              {isRefreshing && (
                <span className="text-xs text-indigo-600 font-medium flex items-center gap-2 bg-indigo-50 px-3 py-1 rounded-full">
                  <RefreshCw className="h-3 w-3 animate-spin"/> Syncing background engines...
                </span>
              )}
            </div>
            
            {loading ? (
              <div className="bg-white border text-center border-gray-200 rounded-2xl p-16 shadow-sm flex flex-col items-center justify-center">
                 <RefreshCw className="h-10 w-10 animate-spin text-indigo-400 mb-4" />
                 <h3 className="text-lg font-medium text-gray-900 mb-1">Loading Database...</h3>
                 <p className="text-gray-500 text-sm max-w-sm">Generating real-time unified dashboard. If this is the initial boot, scraping modules are actively fetching.</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-white border text-center border-gray-200 rounded-2xl p-16 shadow-sm flex flex-col items-center justify-center">
                 <ShieldAlert className="h-12 w-12 text-gray-300 mb-4" />
                 <h3 className="text-lg font-medium text-gray-900 mb-1">No Matches Found</h3>
                 <p className="text-gray-500 text-sm">Decrease the strictness of your filters or broaden your search criteria.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5">
                 {filtered.map(program => {
                   const isSaved = savedIds.has(program.id);
                   const isExpanded = expandedId === program.id;
                   
                   let statusStyle = "bg-emerald-100 text-emerald-700 border-emerald-200";
                   let statusText = "Open";
                   let daysLeft = null;
                   
                   if (program.deadline) {
                     const diffDays = differenceInDays(new Date(program.deadline), new Date());
                     daysLeft = diffDays;
                   }

                   if (program.status === 'closed') {
                     statusStyle = "bg-gray-100 text-gray-700 border-gray-200 opacity-80";
                     statusText = "Closed";
                   } else if (program.status === 'expected') {
                     statusStyle = "bg-indigo-100 text-indigo-700 border-indigo-200";
                     statusText = "Expected";
                   } else if (program.status === 'closing_soon') {
                     statusStyle = "bg-amber-100 text-amber-800 border-amber-200 animate-pulse-slow";
                     statusText = `Closing Soon (${daysLeft} days)`;
                   } else if (program.status === 'open' && daysLeft !== null) {
                     statusText = `Open · Closes in ${daysLeft}d`;
                   }

                   return (
                     <div key={program.id} className={cn(
                       "bg-white rounded-2xl border transition-all duration-300 overflow-hidden relative",
                       isExpanded ? "border-indigo-300 shadow-md" : "border-gray-200 shadow-sm hover:border-gray-300 hover:shadow-md",
                       program.academic_year === currentYearStr && !program.is_expected ? "border-l-4 border-l-emerald-500" : ""
                     )}>
                       {/* Card Header (Always Visible) */}
                       <div className="p-5 sm:p-6 cursor-pointer select-none" onClick={() => setExpandedId(isExpanded ? null : program.id)}>
                          
                          <div className="flex justify-between items-start mb-3">
                             <div className="flex items-center gap-2">
                                <span className={cn(
                                   "px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wider uppercase",
                                   program.type === 'IIT' ? "bg-orange-50 text-orange-700 border border-orange-200/50" : "bg-blue-50 text-blue-700 border border-blue-200/50"
                                )}>
                                  {program.institute_name}
                                </span>
                                <span className={cn("px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide uppercase border flex items-center gap-1.5", statusStyle)}>
                                  {program.status === 'closing_soon' && <AlertCircle className="h-3.5 w-3.5" />}
                                  {statusText}
                                </span>
                                {program.is_expected ? (
                                   <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider text-indigo-700 bg-indigo-100">
                                      EXPECTED
                                   </span>
                                ) : program.academic_year === currentYearStr ? (
                                   <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider text-white bg-indigo-600">
                                      CURRENT YEAR
                                   </span>
                                ) : (
                                   <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider text-gray-600 bg-gray-200">
                                      PREVIOUS YEAR
                                   </span>
                                )}
                             </div>
                             
                             <button 
                               onClick={(e) => { e.stopPropagation(); toggleSave(program.id); }}
                               className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
                             >
                               <Bookmark className={cn("h-5 w-5", isSaved ? "fill-indigo-600 text-indigo-600" : "text-gray-400")} />
                             </button>
                          </div>
                          
                          <h3 className="text-xl font-bold text-gray-900 mb-2 leading-tight">
                            {program.title}
                          </h3>
                          
                          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-600 mb-4">
                             <span className="flex items-center gap-1.5"><Navigation className="h-4 w-4 text-gray-400" /> {program.department}</span>
                             
                             {program.is_expected && program.expected_deadline ? (
                               <div className="flex items-center gap-2">
                                 <span className="flex items-center gap-1.5">
                                   <Calendar className="h-4 w-4 text-indigo-400" /> Est. Timeline: ~{format(new Date(program.expected_deadline), "MMMM yyyy")}
                                 </span>
                                 <span className="px-2 py-0.5 rounded text-[11px] font-bold tracking-wide uppercase bg-indigo-50 text-indigo-600 border border-indigo-100">
                                   Based on Preceding Data
                                 </span>
                               </div>
                             ) : program.deadline ? (
                               <div className="flex items-center gap-2">
                                 <span className="flex items-center gap-1.5">
                                   <Clock className="h-4 w-4 text-gray-400" /> Deadline: {format(new Date(program.deadline), "dd MMM yyyy")}
                                 </span>
                                 <span className={cn(
                                   "px-2 py-0.5 rounded text-[11px] font-bold tracking-wide uppercase",
                                   program.status === 'closed' ? "bg-rose-100 text-rose-700" :
                                   (daysLeft !== null && daysLeft <= 7) ? "bg-amber-100 text-amber-700" :
                                   "bg-emerald-100 text-emerald-700"
                                 )}>
                                   {program.status === 'closed' ? "Closed" : `${daysLeft} Days Left`}
                                 </span>
                               </div>
                             ) : null}
                          </div>
                          
                          <div className="flex items-center justify-between border-t border-gray-100 pt-4 mt-2">
                             <div className="flex flex-wrap gap-2">
                               {program.exams_accepted.slice(0, 3).map((exam, i) => (
                                 <span key={i} className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs font-semibold">{exam}</span>
                               ))}
                               {program.exams_accepted.length > 3 && (
                                 <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-semibold">+{program.exams_accepted.length - 3}</span>
                               )}
                             </div>
                             <div className="flex items-center text-indigo-600 text-sm font-semibold">
                               {isExpanded ? (
                                  <>Collapse <ChevronUp className="h-4 w-4 ml-1" /></>
                               ) : (
                                  <>Details <ChevronDown className="h-4 w-4 ml-1" /></>
                               )}
                             </div>
                          </div>
                       </div>

                       {/* Expanded Body Data */}
                       {isExpanded && (
                         <div className="px-5 sm:px-6 pb-6 bg-gray-50 border-t border-indigo-50 outline-none">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
                               
                               <div className="space-y-5">
                                 <div>
                                   <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Eligibility</p>
                                   <p className="text-sm text-gray-800 leading-relaxed bg-white p-3 rounded-lg border border-gray-200/60 shadow-sm">
                                      {program.eligibility}
                                   </p>
                                 </div>
                                 <div>
                                   <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Research Areas</p>
                                   <div className="flex flex-wrap gap-2">
                                     {program.research_areas.map((area, i) => (
                                       <span key={i} className="inline-flex items-center gap-1 bg-white border border-gray-200 px-2.5 py-1 rounded-md text-xs font-medium text-gray-700 shadow-sm">
                                         <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                         {area}
                                       </span>
                                     ))}
                                   </div>
                                 </div>
                               </div>

                               <div className="space-y-5">
                                  <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
                                     <div className="flex items-start justify-between">
                                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Application Fee</div>
                                        <div className="text-sm font-semibold text-gray-900 text-right">{program.fee}</div>
                                     </div>
                                     <div className="flex items-start justify-between border-t border-gray-100 pt-3">
                                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Contact Details</div>
                                        <div className="text-sm font-semibold text-gray-900 text-right">{program.contact}</div>
                                     </div>
                                     <div className="flex items-start justify-between border-t border-gray-100 pt-3">
                                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Published Date</div>
                                        <div className="text-sm font-semibold text-gray-900 text-right">{format(new Date(program.published_date), "dd MMM yyyy")}</div>
                                     </div>
                                     <div className="flex items-start justify-between border-t border-gray-100 pt-3">
                                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Last Synced</div>
                                        <div className="text-sm font-semibold text-gray-900 text-right">{format(new Date(program.fetched_at), "dd MMM yyyy, HH:mm")}</div>
                                     </div>
                                  </div>
                                  
                                  <div className="pt-2">
                                     <a 
                                       href={program.url}
                                       target="_blank"
                                       rel="noopener noreferrer"
                                       className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold transition-all shadow-md shadow-indigo-200"
                                     >
                                       Official Notification & Apply <ExternalLink className="h-4 w-4" />
                                     </a>
                                  </div>
                               </div>

                            </div>
                         </div>
                       )}

                     </div>
                   );
                 })}
              </div>
            )}
         </div>
         
      </main>
    </div>
  );
}
