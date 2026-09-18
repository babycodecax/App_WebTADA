var window = { TAX_RATES: null, TAX_CALC: null };
eval(require('fs').readFileSync('D:/Projects/App_WebTADA/api/public/js/tax-rates.js','utf8'));
eval(require('fs').readFileSync('D:/Projects/App_WebTADA/api/public/js/tax-calculators.js','utf8'));
var R = window.TAX_RATES;
var C = window.TAX_CALC;
var ok = 0, fail = 0;
function check(name, actual, expected, tol) {
  tol = tol || 0;
  if (Math.abs(actual - expected) <= tol) { ok++; }
  else { fail++; console.log("FAIL: " + name + " = " + actual + " (expect " + expected + ")"); }
}

console.log("=== LƯƠNG TNCN ===");
var s;
s = C.calculateSalaryTax({ salary: 10000000, dependents: 0, hasBHXH: false });
check("Lương 10tr no BHXH taxable", s.taxableIncome > 0 ? 1 : 0, 0);
s = C.calculateSalaryTax({ salary: 20000000, dependents: 0, hasBHXH: true });
check("Lương 20tr BHXH taxable=0", s.taxableIncome > 0 ? 1 : 0, 0);
s = C.calculateSalaryTax({ salary: 30000000, dependents: 0, hasBHXH: true });
check("Lương 30tr taxable>0", s.taxableIncome > 0 ? 1 : 0, 1);
s = C.calculateSalaryTax({ salary: 50000000, dependents: 0, hasBHXH: true });
check("Lương 50tr tax>0", s.monthlyTax > 0 ? 1 : 0, 1);
s = C.calculateSalaryTax({ salary: 50000000, dependents: 3, hasBHXH: true });
var s0 = C.calculateSalaryTax({ salary: 50000000, dependents: 0, hasBHXH: true });
check("Lương 50tr 3NPT < 0NPT", s.monthlyTax < s0.monthlyTax ? 1 : 0, 1);
s = C.calculateSalaryTax({ salary: 100000000, dependents: 0, hasBHXH: true });
check("Lương 100tr taxable>0", s.taxableIncome > 0 ? 1 : 0, 1);
s = C.calculateSalaryTax({ salary: 2000000, dependents: 0, hasBHXH: false });
check("Lương 2tr < GTGC = 0", s.monthlyTax, 0);

console.log("\n=== HKD ===");
var h;
h = C.calculateHKDTax({ revenue: 500000000, businessType: "phan_phoi" });
check("HKD 500M exempt", h.exempt ? 1 : 0, 1);
h = C.calculateHKDTax({ revenue: 1000000000, businessType: "phan_phoi" });
check("HKD 1 ty exempt", h.exempt ? 1 : 0, 1);
h = C.calculateHKDTax({ revenue: 1000000001, businessType: "phan_phoi" });
check("HKD 1 ty+1 not exempt", h.exempt ? 0 : 1, 1);
h = C.calculateHKDTax({ revenue: 2000000000, businessType: "phan_phoi", costs: 0 });
check("HKD PP 2 ty M1>0", h.method1.total > 0 ? 1 : 0, 1);
h = C.calculateHKDTax({ revenue: 2000000000, businessType: "dich_vu_xd", costs: 0 });
check("HKD DV 2 ty GTGT=100M", h.method1.gtgt, 100000000);
h = C.calculateHKDTax({ revenue: 5000000000, businessType: "phan_phoi", costs: 4000000000 });
check("HKD PP 5 ty CP4 ty M2<M1", h.method2.total < h.method1.total ? 1 : 0, 1);
h = C.calculateHKDTax({ revenue: 30000000000, businessType: "dich_vu_xd", costs: 0 });
check("HKD DV 30 ty nhom3", h.group.id, 3);
h = C.calculateHKDTax({ revenue: 60000000000, businessType: "phan_phoi", costs: 0 });
check("HKD PP 60 ty nhom4", h.group.id, 4);

console.log("\n=== TNDN ===");
var t;
t = C.calculateTNDNTax({ revenue: 0, taxableIncome: 0, sector: "general" });
check("TNDN DT=0 not exempt", t.exempt ? 0 : 1, 1);
t = C.calculateTNDNTax({ revenue: 500000000, taxableIncome: 0, sector: "general" });
check("TNDN DT=500M exempt", t.exempt ? 1 : 0, 1);
t = C.calculateTNDNTax({ revenue: 1000000000, taxableIncome: 0, sector: "general" });
check("TNDN DT=1 ty exempt", t.exempt ? 1 : 0, 1);
t = C.calculateTNDNTax({ revenue: 1000000001, taxableIncome: 0, sector: "general" });
check("TNDN DT=1 ty+1 not exempt", t.exempt ? 0 : 1, 1);
t = C.calculateTNDNTax({ revenue: 2000000000, taxableIncome: 1000000000, sector: "general" });
check("TNDN 2 ty 15%", t.totalTax, 150000000);
t = C.calculateTNDNTax({ revenue: 20000000000, taxableIncome: 5000000000, sector: "general" });
check("TNDN 20 ty 17%", t.totalTax, 850000000);
t = C.calculateTNDNTax({ revenue: 60000000000, taxableIncome: 5000000000, sector: "general" });
check("TNDN 60 ty 20%", t.totalTax, 1000000000);
t = C.calculateTNDNTax({ revenue: 20000000000, taxableIncome: 5000000000, sector: "high_tech" });
check("TNDN CN cao 10%", t.totalTax, 500000000);
t = C.calculateTNDNTax({ revenue: 20000000000, taxableIncome: 5000000000, sector: "oil_gas" });
check("TNDN dau khi 25%", t.totalTax, 1250000000);
t = C.calculateTNDNTax({ revenue: 20000000000, taxableIncome: 5000000000, sector: "rare_resource" });
check("TNDN quy hiem 40%", t.totalTax, 2000000000);
t = C.calculateTNDNTax({ revenue: 10000000000, taxableIncome: 0, sector: "pct_distribution" });
check("TNDN phan phoi 0.3%", t.totalTax, 30000000);
t = C.calculateTNDNTax({ revenue: 10000000000, taxableIncome: 0, sector: "pct_transport" });
check("TNDN van tai 1.2%", t.totalTax, 120000000);
t = C.calculateTNDNTax({ revenue: 10000000000, taxableIncome: 0, sector: "pct_service", pctRate: "1.5" });
check("TNDN DV 1.5%", t.totalTax, 150000000);
t = C.calculateTNDNTax({ revenue: 10000000000, taxableIncome: 0, sector: "pct_service", pctRate: "3" });
check("TNDN DV 3%", t.totalTax, 300000000);
t = C.calculateTNDNTax({ revenue: 10000000000, taxableIncome: 0, sector: "pct_service", pctRate: "" });
check("TNDN DV empty pct = 0", t.totalTax, 0);
t = C.calculateTNDNTax({ revenue: 60000000000, taxableIncome: 10000000000, charitableDonation: 3000000000, rdFund: 2000000000, lossCarryforward: 1000000000, sector: "general" });
check("TNDN CT capped 20%", t.deductions.charitable, 2000000000);
check("TNDN RD capped 10%", t.deductions.rd, 1000000000);
check("TNDN after ded 6B", t.incomeAfterDeductions, 6000000000);
check("TNDN tax 1.2B", t.totalTax, 1200000000);

console.log("\n=== THUE BDS ===");
var r;
r = C.calculateRentalTax({ revenue: 500000000 });
check("Thue 500M exempt", r.exempt ? 1 : 0, 1);
r = C.calculateRentalTax({ revenue: 1000000000 });
check("Thue 1 ty exempt", r.exempt ? 1 : 0, 1);
r = C.calculateRentalTax({ revenue: 1000000001 });
check("Thue 1 ty+1 = 10%", r.totalTax, 100000000, 1);
r = C.calculateRentalTax({ revenue: 5000000000 });
check("Thue 5 ty = 500M", r.totalTax, 500000000);

console.log("\n=== NCNN ===");
var f;
f = C.calculateForeignContractor({ grossRevenue: 100000000, contractorType: "service", dependents: 0 });
check("NCNN DV 100M = 6M", f.totalTax, 6000000);
f = C.calculateForeignContractor({ grossRevenue: 500000000, contractorType: "service", dependents: 0 });
check("NCNN DV 500M = 30M", f.totalTax, 30000000);
f = C.calculateForeignContractor({ grossRevenue: 100000000, contractorType: "non_resident", dependents: 0 });
check("NCNN NC 100M = 25M", f.totalTax, 25000000);
f = C.calculateForeignContractor({ grossRevenue: 500000000, contractorType: "salary", dependents: 0 });
check("NCNN luong 500M 0NPT taxable=314M", f.taxableIncome, 314000000);
f = C.calculateForeignContractor({ grossRevenue: 200000000, contractorType: "salary", dependents: 2 });
check("NCNN luong 200M 2NPT tax>0", f.totalTax > 0 ? 1 : 0, 1);
f = C.calculateForeignContractor({ grossRevenue: 100000000, contractorType: "salary", dependents: 1 });
check("NCNN luong 100M 1NPT tax small", f.totalTax < 10000000 ? 1 : 0, 1);

console.log("\n=== TO HOP ===");
// Luong + TNDN
var salary50 = C.calculateSalaryTax({ salary: 50000000, dependents: 1, hasBHXH: true });
var corp1 = C.calculateTNDNTax({ revenue: 20000000000, taxableIncome: 5000000000, sector: "high_tech" });
check("Combo Luong+TNDN both>0", (salary50.monthlyTax > 0 && corp1.totalTax > 0) ? 1 : 0, 1);

// TNDN + TNDN (2 DN)
var corp2a = C.calculateTNDNTax({ revenue: 5000000000, taxableIncome: 1000000000, sector: "high_tech" });
var corp2b = C.calculateTNDNTax({ revenue: 60000000000, taxableIncome: 5000000000, sector: "general" });
check("Combo 2 DN different sectors", corp2a.totalTax !== corp2b.totalTax ? 1 : 0, 1);
check("DN1 CN cao 10%", corp2a.totalTax, 100000000);
check("DN2 thuong 20%*17%", corp2b.totalTax, 850000000);

// HKD + Luong
var hkd1 = C.calculateHKDTax({ revenue: 2000000000, businessType: "phan_phoi", costs: 0 });
check("Combo HKD+Luong both>0", (hkd1.method1.total > 0 && salary50.monthlyTax > 0) ? 1 : 0, 1);

// NCNN DV + NCNN Luong (2 nguon NCNN khac loai)
var fc1 = C.calculateForeignContractor({ grossRevenue: 200000000, contractorType: "service", dependents: 0 });
var fc2 = C.calculateForeignContractor({ grossRevenue: 200000000, contractorType: "salary", dependents: 0 });
check("Combo 2 NCNN khac loai", fc1.totalTax !== fc2.totalTax ? 1 : 0, 1);

// 3 DN cung loai, 3 nganh khac nhau
var d1 = C.calculateTNDNTax({ revenue: 5000000000, taxableIncome: 1000000000, sector: "high_tech" });
var d2 = C.calculateTNDNTax({ revenue: 5000000000, taxableIncome: 1000000000, sector: "oil_gas" });
var d3 = C.calculateTNDNTax({ revenue: 5000000000, taxableIncome: 1000000000, sector: "pct_distribution" });
check("3 DN 3 nganh khac nhau", (d1.totalTax !== d2.totalTax && d2.totalTax !== d3.totalTax) ? 1 : 0, 1);
check("DN1 CN cao 10% = 100M", d1.totalTax, 100000000);
check("DN2 dau khi 25% = 250M", d2.totalTax, 250000000);
check("DN3 phan phoi 0.3% = 15M", d3.totalTax, 15000000);

console.log("\n=== KET QUA ===");
console.log("Pass: " + ok + "/" + (ok+fail));
if (fail > 0) console.log("FAIL: " + fail);
else console.log("ALL PASSED");
