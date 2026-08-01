import React, { useState, useEffect } from 'react';

interface Term {
    id: number;
    name: string;
    slug: string;
    taxonomySlug: string;
}

interface Entry {
    id: number;
    slug: string;
    title?: string;
    name?: string;
    status: string;
    publishedAt: string;
    authorName: string;
    terms?: Term[];
}

export default function EntriesTable({ collectionSlug, initialPage, initialSearch }: { collectionSlug: string, initialPage: number, initialSearch: string }) {
    const [entries, setEntries] = useState<Entry[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(initialPage);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState(initialSearch);
    
    // New Filters
    const [statusFilter, setStatusFilter] = useState('');
    const [dateFilter, setDateFilter] = useState('');
    const [termFilter, setTermFilter] = useState('');
    const [availableTerms, setAvailableTerms] = useState<any[]>([]);

    const limit = 20;

    useEffect(() => {
        // Fetch all taxonomies/terms for filter dropdown
        const fetchTerms = async () => {
            try {
                const res = await fetch(`/api/taxonomy-builder`);
                const taxonomies = await res.json();
                const termsList: any[] = [];
                for (const tax of taxonomies) {
                    try {
                        const allowed = JSON.parse(tax.allowedCollections || '[]');
                        if (allowed.includes(collectionSlug)) {
                            const termRes = await fetch(`/api/taxonomies/${tax.slug}/terms`);
                            const terms = await termRes.json();
                            terms.forEach((t: any) => {
                                termsList.push({ ...t, taxName: tax.label });
                            });
                        }
                    } catch(e) {}
                }
                setAvailableTerms(termsList);
            } catch (e) { console.error("Failed to load terms", e); }
        };
        fetchTerms();
    }, [collectionSlug]);

    useEffect(() => {
        fetchData();
    }, [page, search, statusFilter, dateFilter, termFilter]);

    const fetchData = async () => {
        setLoading(true);
        try {
            let url = `/api/content/${collectionSlug}/entries?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`;
            if (statusFilter) url += `&status=${statusFilter}`;
            if (dateFilter) url += `&date=${dateFilter}`;
            if (termFilter) url += `&termId=${termFilter}`;
            
            const res = await fetch(url);
            const json = await res.json();
            if (json.data) {
                setEntries(json.data);
                setTotal(json.total);
            }
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this entry?')) return;
        
        try {
            const res = await fetch(`/api/content/${collectionSlug}/entries/${id}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                fetchData();
            } else {
                alert('Failed to delete');
            }
        } catch(e) {
            alert('Error deleting entry');
        }
    };

    const totalPages = Math.ceil(total / limit);

    return (
        <div>
            {/* Filter Bar */}
            <div className="p-4 border-b border-border bg-card flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase">Status:</label>
                    <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                        <option value="">All</option>
                        <option value="published">Published</option>
                        <option value="draft">Draft</option>
                        <option value="protected">Protected</option>
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase">Date:</label>
                    <input 
                        type="text" 
                        value={dateFilter} 
                        onChange={e => { setDateFilter(e.target.value); setPage(1); }} 
                        placeholder="YYYY, YYYY-MM, YYYY-MM-DD" 
                        title="Filter by Year (2026), Month (2026-08), or Exact Day (2026-08-01)"
                        className="h-9 w-52 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" 
                    />
                </div>
                {availableTerms.length > 0 && (
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold text-muted-foreground uppercase">Taxonomy:</label>
                        <select value={termFilter} onChange={e => { setTermFilter(e.target.value); setPage(1); }} className="h-9 max-w-[200px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                            <option value="">All Terms</option>
                            {availableTerms.map(t => (
                                <option key={t.id} value={t.id}>{t.taxName}: {t.name}</option>
                            ))}
                        </select>
                    </div>
                )}
                {/* Search is handled by parent, but we can reset filters here */}
                {(statusFilter || dateFilter || termFilter) && (
                    <button onClick={() => { setStatusFilter(''); setDateFilter(''); setTermFilter(''); setPage(1); }} className="text-xs font-semibold text-muted-foreground hover:text-primary transition-colors underline ml-auto">
                        Clear Filters
                    </button>
                )}
            </div>

            <div className="overflow-x-auto relative min-h-[300px]">
                {loading && (
                    <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10 backdrop-blur-[1px]">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                )}
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-muted-foreground uppercase bg-muted/30 border-b border-border">
                        <tr>
                            <th className="px-6 py-4 font-semibold">Title</th>
                            <th className="px-6 py-4 font-semibold">Author</th>
                            <th className="px-6 py-4 font-semibold">Status</th>
                            <th className="px-6 py-4 font-semibold">Date</th>
                            <th className="px-6 py-4 font-semibold">Taxonomies</th>
                            <th className="px-6 py-4 text-right font-semibold">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {entries.length === 0 && !loading && (
                            <tr>
                                <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                                    No entries found.
                                </td>
                            </tr>
                        )}
                        {entries.map(entry => (
                            <tr key={entry.id} className="bg-card hover:bg-muted/10 transition-colors group">
                                <td className="px-6 py-4 font-medium text-foreground">
                                    <div className="flex flex-col">
                                        <a href={`/admin/content/${collectionSlug}/edit/${entry.id}`} className="hover:text-primary transition-colors text-base font-bold">
                                            {entry.title || entry.name || entry.slug || 'Untitled'}
                                        </a>
                                        <span className="text-xs text-muted-foreground mt-1 font-mono">/{entry.slug}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold">
                                            {entry.authorName.charAt(0).toUpperCase()}
                                        </div>
                                        {entry.authorName}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${entry.status === 'published' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'}`}>
                                        {entry.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-muted-foreground whitespace-nowrap text-xs">
                                    {new Date(entry.publishedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                                        {entry.terms && entry.terms.length > 0 ? (
                                            <>
                                                {entry.terms.slice(0, 3).map(t => (
                                                    <span key={t.id} className="px-1.5 py-0.5 bg-secondary text-secondary-foreground rounded text-[10px] uppercase font-bold tracking-wider">
                                                        {t.name}
                                                    </span>
                                                ))}
                                                {entry.terms.length > 3 && (
                                                    <span className="px-1.5 py-0.5 bg-muted text-muted-foreground rounded text-[10px] uppercase font-bold tracking-wider">
                                                        +{entry.terms.length - 3} more
                                                    </span>
                                                )}
                                            </>
                                        ) : (
                                            <span className="text-muted-foreground text-xs italic">None</span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right whitespace-nowrap">
                                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <a href={`/admin/content/${collectionSlug}/edit/${entry.id}`} className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors" title="Edit">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                                        </a>
                                        {entry.status === 'published' && collectionSlug === 'articles' && (
                                            <a href={`/${entry.slug}`} target="_blank" rel="noopener noreferrer" className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors" title="View">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                                            </a>
                                        )}
                                        <button onClick={() => handleDelete(entry.id)} className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors" title="Delete">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {totalPages > 1 && (
                <div className="p-4 border-t border-border flex items-center justify-between bg-muted/10">
                    <span className="text-sm text-muted-foreground">
                        Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} entries
                    </span>
                    <div className="flex gap-1">
                        <button 
                            disabled={page === 1}
                            onClick={() => setPage(p => p - 1)}
                            className="px-3 py-1 text-sm border border-border rounded hover:bg-muted disabled:opacity-50 transition-colors"
                        >
                            Prev
                        </button>
                        <button 
                            disabled={page === totalPages}
                            onClick={() => setPage(p => p + 1)}
                            className="px-3 py-1 text-sm border border-border rounded hover:bg-muted disabled:opacity-50 transition-colors"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
