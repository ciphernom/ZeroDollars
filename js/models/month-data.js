export class MonthData {
  constructor(data = {}) {
    this.month = data.month || '';
    this.tbb = data.tbb || 0;
    this.budgeted = data.budgeted || 0;
  }
  updateTBB(delta) {
    this.tbb += delta;
  }
  updateBudgeted(delta) {
    this.budgeted += delta;
  }
}
