import React, { useState, useEffect } from 'react';
import { Star } from 'lucide-react';

export default function TaxonomySelector({ label, taxonomySlug, selectedTerms, onChange, isPrefixPriority, onTermData, primaryTermId, onSetPrimaryTerm, allowInlineCreation, inlineSearchHint }: { label: string, taxonomySlug: string, selectedTerms: string[], onChange: (terms: string[]) => void, isPrefixPriority?: boolean, onTermData?: (terms: any[]) => void, primaryTermId?: string | number, onSetPrimaryTerm?: (termId: string | number | null) => void, allowInlineCreation?: boolean, inlineSearchHint?: string }) {
    const [terms, setTerms] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(searchTerm);
        }, 300);
        return () => clearTimeout(handler);
    }, [searchTerm]);

    useEffect(() => {
        fetchTerms();
    }, [taxonomySlug, debouncedSearch]); // Re-fetch when search changes

    const fetchTerms = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (debouncedSearch) params.append('search', debouncedSearch);
            if (selectedTerms.length > 0) params.append('include_ids', selectedTerms.join(','));
            
            const res = await fetch(`/api/taxonomies/${taxonomySlug}/terms?${params.toString()}`);
            const json = await res.json() as any;
            if (json.data) {
                setTerms(json.data);
                if (onTermData) onTermData(json.data);
            }
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    const toggleTerm = (termId: string) => {
        if (selectedTerms.includes(termId)) {
            onChange(selectedTerms.filter(id => id !== termId));
        } else {
            onChange([...selectedTerms, termId]);
        }
    };

    const handleCreateTerm = async () => {
        if (!searchTerm.trim() || isCreating) return;
        setIsCreating(true);
        try {
            const res = await fetch(`/api/taxonomies/${taxonomySlug}/terms`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: searchTerm.trim() })
            });
            const json = await res.json() as any;
            if (res.ok && json.success && json.id) {
                const newIdStr = json.id.toString();
                onChange([...selectedTerms, newIdStr]);
                setSearchTerm('');
                fetchTerms(); // Refresh the list
            } else {
                alert(`Error creating term: ${json.error || 'Unknown error'}`);
            }
        } catch (e) {
            console.error(e);
            alert("Network error creating term");
        }
        setIsCreating(false);
    };

    return (
        <div className={`bg-card border ${isPrefixPriority ? 'border-primary ring-1 ring-primary/20' : 'border-border'} rounded-xl shadow-sm p-6`}>
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
                <h3 className="text-sm font-bold uppercase tracking-wider">{label}</h3>
                {isPrefixPriority && (
                    <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded uppercase tracking-wider flex items-center gap-1">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                        URL Prefix
                    </span>
                )}
            </div>

            <div className="mb-3">
                <input
                    type="text"
                    placeholder={`Search ${label}...`}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-background border border-input rounded focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {inlineSearchHint && (
                    <div className="text-xs text-muted-foreground mt-1.5">{inlineSearchHint}</div>
                )}
            </div>
            
            {allowInlineCreation && searchTerm.trim() && !terms.find(t => t.name.toLowerCase() === searchTerm.trim().toLowerCase()) && (
                <div className="mb-3 p-2 bg-muted/30 border border-border rounded flex items-center justify-between">
                    <span className="text-sm font-medium">Create "{searchTerm.trim()}"</span>
                    <button
                        type="button"
                        onClick={handleCreateTerm}
                        disabled={isCreating}
                        className="px-3 py-1 text-xs bg-primary text-primary-foreground font-semibold rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                        {isCreating ? 'Creating...' : 'Create'}
                    </button>
                </div>
            )}
            

            {loading && terms.length === 0 ? (
                <div className="animate-pulse flex space-x-4">
                    <div className="flex-1 space-y-3 py-1">
                        <div className="h-4 bg-muted rounded w-3/4"></div>
                        <div className="h-4 bg-muted rounded w-1/2"></div>
                    </div>
                </div>
            ) : (
                <div className="max-h-64 overflow-y-auto pr-2 space-y-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                    {terms.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No terms found.</p>
                    ) : (
                        terms.map(term => {
                            const isSelected = selectedTerms.includes(term.id.toString());
                            const isPrimary = primaryTermId?.toString() === term.id.toString();
                            
                            return (
                                <div key={term.id} className="flex items-center justify-between p-1.5 hover:bg-muted/30 rounded transition-colors group">
                                    <label className="flex items-start gap-2 cursor-pointer flex-1">
                                        <input 
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => {
                                                toggleTerm(term.id.toString());
                                                if (isSelected && isPrimary && onSetPrimaryTerm) {
                                                    onSetPrimaryTerm(null); // Deselect primary if unchecked
                                                }
                                            }}
                                            className="mt-0.5 w-4 h-4 text-primary bg-background border-input rounded focus:ring-primary focus:ring-2"
                                        />
                                        <span className={`text-sm transition-colors ${isSelected ? 'font-medium text-foreground group-hover:text-primary' : 'text-foreground/80 group-hover:text-primary'}`}>{term.name}</span>
                                    </label>
                                    
                                    {isSelected && onSetPrimaryTerm && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                onSetPrimaryTerm(isPrimary ? null : term.id);
                                            }}
                                            className={`p-1 rounded flex items-center justify-center transition-colors ${isPrimary ? 'text-amber-500 bg-amber-500/10' : 'text-muted-foreground hover:text-amber-500 hover:bg-muted'}`}
                                            title={isPrimary ? "Primary Term (Display & URL)" : "Make Primary Term"}
                                        >
                                            <Star size={14} className={isPrimary ? 'fill-current' : ''} />
                                        </button>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
}
