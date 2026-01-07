// Math Utility Functions (Pure, stateless)
export const MathUtils = {
    sum: (arr) => arr.reduce((a, b) => a + b, 0),
    mean: (arr) => arr.length ? MathUtils.sum(arr) / arr.length : 0,

    // Standard Deviation
    standardDeviation: (arr) => {
        if (arr.length < 2) return 0;
        const avg = MathUtils.mean(arr);
        const variance = arr.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / (arr.length - 1);
        return Math.sqrt(variance);
    },

    median: (arr) => {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    },

    // Robustness: Uses Interquartile Range (IQR) to remove outliers (one-off strange bills)
    filterOutliers: (arr) => {
        if (arr.length < 4) return arr;
        const sorted = [...arr].sort((a, b) => a - b);
        const q1 = sorted[Math.floor((sorted.length / 4))];
        const q3 = sorted[Math.ceil((sorted.length * (3 / 4))) - 1];
        const iqr = q3 - q1;
        const min = q1 - 1.5 * iqr;
        const max = q3 + 1.5 * iqr;
        return arr.filter(x => x >= min && x <= max);
    },

    // Method 3: Autocorrelation Function (ACF)
    // Detects periodicity. Returns max correlation and lag.
    autocorrelation: (arr, maxLag) => {
        const n = arr.length;
        if (n < 2) return { maxCorr: 0, lag: 0 };
        
        const mean = MathUtils.mean(arr);
        const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
        
        // CRITICAL: If variance is 0 (intervals are identical), it is perfectly periodic.
        if (variance === 0) return { maxCorr: 1, lag: 1 };

        let maxCorr = -1; 
        let bestLag = 0;

        for (let lag = 1; lag <= Math.min(maxLag, n - 1); lag++) {
            let cov = 0;
            for (let i = 0; i < n - lag; i++) {
                cov += (arr[i] - mean) * (arr[i + lag] - mean);
            }
            const corr = (cov / (n - lag)) / variance;
            if (corr > maxCorr) {
                maxCorr = corr;
                bestLag = lag;
            }
        }
        return { maxCorr, lag: bestLag };
    },

    // Method 5: Benford's Law Divergence
    // Checks if amounts look "natural" (random) or "artificial" (fixed prices).
    benfordsDivergence: (amounts) => {
        if (amounts.length < 3) return 1; // Insufficient data, assume high divergence
        
        // Extract leading digits (1-9)
        const leadingDigits = amounts.map(a => parseInt(Math.abs(a).toString()[0], 10)).filter(d => d > 0);
        if (leadingDigits.length < 3) return 1;

        const freq = Array(10).fill(0);
        leadingDigits.forEach(d => freq[d]++);
        
        const pActual = freq.slice(1).map(f => f / leadingDigits.length);
        const pBenford = [0.3010, 0.1761, 0.1249, 0.0969, 0.0792, 0.0669, 0.0580, 0.0512, 0.0458];

        const dot = pActual.reduce((sum, p, i) => sum + p * pBenford[i], 0);
        const normActual = Math.sqrt(pActual.reduce((sum, p) => sum + p * p, 0));
        const normBenford = Math.sqrt(pBenford.reduce((sum, p) => sum + p * p, 0));
        
        if (normActual === 0 || normBenford === 0) return 1;
        
        // Returns Cosine Similarity. 
        // 1.0 = Follows Benford (Natural/Random). 
        // < 0.8 = Diverges (Artificial/Fixed Price).
        return dot / (normActual * normBenford); 
    },

    // Method 1: Linear Time O(N) Subsequence Detection
    // Finds the longest chain of dates that fit a specific interval pattern
    longestConsistentSubsequence: (dates, expectedInterval, K = 3) => {
        if (dates.length < 2) return 0;
        const sorted = [...dates].sort((a, b) => a - b);
        
        let maxSeq = 0;
        let currentSeq = 0;

        for (let i = 1; i < sorted.length; i++) {
            const diffTime = Math.abs(sorted[i] - sorted[i - 1]);
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
            
            if (Math.abs(diffDays - expectedInterval) <= K) {
                currentSeq++; // Found a link in the chain
            } else {
                maxSeq = Math.max(maxSeq, currentSeq);
                currentSeq = 0; // Reset chain
            }
        }
        maxSeq = Math.max(maxSeq, currentSeq);
        
        // Return number of items in sequence (edges + 1)
        return maxSeq > 0 ? maxSeq + 1 : 0; 
    }
};
