// js/services/lot-tracker.js

export class LotTracker {
  constructor(account, baseCurrency) {
    this.account = account;
    this.baseCurrency = baseCurrency;
  }

  // Get all acquisition lots (buys that haven't been fully disposed)
  getOpenLots() {
    const acquisitions = this.account.transactions
      .filter(tx => !tx.deleted && tx.amount > 0)  // Positive = acquisition
      .map(tx => ({
        id: tx.id,
        date: tx.date,
        units: tx.amount,  // In native units (satoshis)
        remainingUnits: tx.amount,
        costBasis: tx.baseCurrencyAmount || 0,  // What we paid in AUD
        rate: tx.exchangeRate
      }));

    // Reduce by disposals (FIFO)
    const disposals = this.account.transactions
      .filter(tx => !tx.deleted && tx.amount < 0)
      .sort((a, b) => a.date - b.date);  // Process oldest first

    for (const disposal of disposals) {
      let unitsToAllocate = Math.abs(disposal.amount);
      
      for (const lot of acquisitions) {
        if (unitsToAllocate <= 0) break;
        if (lot.remainingUnits <= 0) continue;
        
        const allocated = Math.min(lot.remainingUnits, unitsToAllocate);
        lot.remainingUnits -= allocated;
        unitsToAllocate -= allocated;
      }
    }

    return acquisitions.filter(lot => lot.remainingUnits > 0);
  }

  // Calculate gain/loss for a disposal transaction
  calculateGainLoss(disposalTx) {
    if (disposalTx.amount >= 0) return null;  // Not a disposal
    
    const disposalUnits = Math.abs(disposalTx.amount);
    const proceeds = disposalTx.baseCurrencyAmount || 0;
    
    // Find which lots this disposal came from (FIFO)
    const acquisitions = this.account.transactions
      .filter(tx => !tx.deleted && tx.amount > 0 && tx.date < disposalTx.date)
      .sort((a, b) => a.date - b.date);

    // Track what's been used by prior disposals
    const priorDisposals = this.account.transactions
      .filter(tx => !tx.deleted && tx.amount < 0 && tx.date < disposalTx.date)
      .sort((a, b) => a.date - b.date);

    // Clone lots with remaining units
    const lots = acquisitions.map(tx => ({
      id: tx.id,
      date: tx.date,
      units: tx.amount,
      remaining: tx.amount,
      costBasis: tx.baseCurrencyAmount || 0,
      unitCost: (tx.baseCurrencyAmount || 0) / tx.amount
    }));

    // Deduct prior disposals
    for (const prior of priorDisposals) {
      let toDeduct = Math.abs(prior.amount);
      for (const lot of lots) {
        if (toDeduct <= 0) break;
        const deducted = Math.min(lot.remaining, toDeduct);
        lot.remaining -= deducted;
        toDeduct -= deducted;
      }
    }

    // Now allocate this disposal
    let unitsToAllocate = disposalUnits;
    let totalCostBasis = 0;
    const allocations = [];

    for (const lot of lots) {
      if (unitsToAllocate <= 0) break;
      if (lot.remaining <= 0) continue;

      const allocated = Math.min(lot.remaining, unitsToAllocate);
      const costForAllocation = Math.round(lot.unitCost * allocated);
      
      allocations.push({
        lotId: lot.id,
        lotDate: lot.date,
        units: allocated,
        costBasis: costForAllocation,
        holdingPeriodDays: Math.floor((disposalTx.date - lot.date) / (1000 * 60 * 60 * 24))
      });

      totalCostBasis += costForAllocation;
      unitsToAllocate -= allocated;
    }

    const gain = proceeds - totalCostBasis;
    
    // CGT discount (Australia: 50% if held > 12 months)
    const longTermUnits = allocations
      .filter(a => a.holdingPeriodDays >= 365)
      .reduce((sum, a) => sum + a.units, 0);
    
    const longTermRatio = disposalUnits > 0 ? longTermUnits / disposalUnits : 0;
    const discountableGain = gain > 0 ? gain * longTermRatio * 0.5 : 0;
    const taxableGain = gain - discountableGain;

    return {
      disposalDate: disposalTx.date,
      units: disposalUnits,
      proceeds,
      costBasis: totalCostBasis,
      gain,
      discountableGain,
      taxableGain,
      allocations,
      isLongTerm: longTermRatio > 0.5
    };
  }

  // Generate full tax report
  generateTaxReport(financialYear) {
    // Australian FY: July 1 - June 30
    const fyStart = new Date(`${financialYear - 1}-07-01`).getTime();
    const fyEnd = new Date(`${financialYear}-06-30T23:59:59`).getTime();

    const disposals = this.account.transactions
      .filter(tx => 
        !tx.deleted && 
        tx.amount < 0 && 
        tx.date >= fyStart && 
        tx.date <= fyEnd
      )
      .sort((a, b) => a.date - b.date);

    const events = disposals.map(tx => this.calculateGainLoss(tx)).filter(Boolean);
    
    const totalGain = events.reduce((sum, e) => sum + e.gain, 0);
    const totalTaxable = events.reduce((sum, e) => sum + e.taxableGain, 0);
    const totalDiscount = events.reduce((sum, e) => sum + e.discountableGain, 0);

    return {
      financialYear,
      currency: this.account.currency,
      baseCurrency: this.baseCurrency,
      events,
      summary: {
        totalProceeds: events.reduce((sum, e) => sum + e.proceeds, 0),
        totalCostBasis: events.reduce((sum, e) => sum + e.costBasis, 0),
        totalGain,
        totalDiscount,
        totalTaxable
      }
    };
  }
}
