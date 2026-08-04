import React, { useState, useEffect } from 'react';

export default function TaxonomySelector({ label, taxonomySlug, selectedTerms, onChange }: { label: string, taxonomySlug: string, selectedTerms: string[], onChange: (terms: string[]) => void }) {
    const [terms, setTerms] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchTerms();
    }, [taxonomySlug]);

    const fetchTerms = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/taxonomies/${taxonomySlug}/terms`);
            const json = await res.json() as any;
            if (json.data) {
                setTerms(json.data);
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

    return (
        <div className="bg-card border border-border rounded-xl shadow-sm p-6">
            <h3 className="text-sm font-bold uppercase tracking-wider mb-4 pb-2 border-b border-border">{label}</h3>
            
            {loading ? (
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
                        terms.map(term => (
                            <label key={term.id} className="flex items-start gap-2 p-1.5 hover:bg-muted/30 rounded cursor-pointer transition-colors group">
                                <input 
                                    type="checkbox"
                                    checked={selectedTerms.includes(term.id.toString())}
                                    onChange={() => toggleTerm(term.id.toString())}
                                    className="mt-0.5 w-4 h-4 text-primary bg-background border-input rounded focus:ring-primary focus:ring-2"
                                />
                                <span className="text-sm text-foreground group-hover:text-primary transition-colors">{term.name}</span>
                            </label>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
