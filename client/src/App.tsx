import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { BrandingProvider } from './context/BrandingContext';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';
import { Login } from './pages/Login';
import { HomePage } from './pages/HomePage';
import { EmployeeGroupList } from './pages/masters/EmployeeGroupList';
import { EmployeeGroupForm } from './pages/masters/EmployeeGroupForm';
import { UnitList } from './pages/masters/UnitList';
import { UnitForm } from './pages/masters/UnitForm';
import { ProductGroupList } from './pages/masters/ProductGroupList';
import { ProductGroupForm } from './pages/masters/ProductGroupForm';
import { ProcessMasterList } from './pages/masters/ProcessMasterList';
import { ProcessMasterForm } from './pages/masters/ProcessMasterForm';
import { CompanyList } from './pages/masters/CompanyList';
import { CompanyForm } from './pages/masters/CompanyForm';
import { EmployeeList } from './pages/masters/EmployeeList';
import { EmployeeForm } from './pages/masters/EmployeeForm';
import { OperationList } from './pages/masters/OperationList';
import { OperationForm } from './pages/masters/OperationForm';
import { ProductList } from './pages/masters/ProductList';
import { ProductForm } from './pages/masters/ProductForm';
import { JobOrderList } from './pages/transactions/JobOrderList';
import { JobOrderForm } from './pages/transactions/JobOrderForm';
import { LotOperationMapList } from './pages/transactions/LotOperationMapList';
import { LotOperationMapForm } from './pages/transactions/LotOperationMapForm';
import { LotOperationPrint } from './pages/transactions/LotOperationPrint';
import { MaterialIssueList } from './pages/transactions/MaterialIssueList';
import { DailyProcessEntryList } from './pages/transactions/DailyProcessEntryList';
import { DailyOpEntry } from './pages/transactions/DailyOpEntry';
import { ProcessWorkReport } from './pages/reports/ProcessWorkReport';
import { DailyProcessReport } from './pages/reports/DailyProcessReport';
import { SalaryReport } from './pages/reports/SalaryReport';
import { LotwiseGroupwiseReport } from './pages/reports/LotwiseGroupwiseReport';
import { LotBalanceSheet } from './pages/balance/LotBalanceSheet'; // Balance Reports (new section)
import { LotSummary } from './pages/balance/LotSummary'; // Balance Reports (new section)
import { SpineAttendance } from './pages/utility/SpineAttendance';
import { UpdateAttendance } from './pages/utility/UpdateAttendance';
import { LoginList } from './pages/admin/LoginList';
import { LoginForm } from './pages/admin/LoginForm';
import { BackupsPage } from './pages/admin/BackupsPage';
import { BrandingPage } from './pages/admin/BrandingPage';

export default function App() {
  return (
    <BrandingProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Login Route */}
            <Route path="/login" element={<Login />} />

            {/* Protected Routes wrapped in App Shell */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              {/* Home / Menu Page */}
              <Route index element={<HomePage />} />

              {/* Company Master (Phase 5) */}
              <Route path="masters/company" element={<CompanyList />} />
              <Route path="masters/company/new" element={<CompanyForm />} />
              <Route path="masters/company/:id" element={<CompanyForm />} />
              
              {/* Employee Group (Phase 4) */}
              <Route path="masters/employee-group" element={<EmployeeGroupList />} />
              <Route path="masters/employee-group/new" element={<EmployeeGroupForm />} />
              <Route path="masters/employee-group/:id" element={<EmployeeGroupForm />} />

              {/* Employee Master (Phase 5) */}
              <Route path="masters/employee" element={<EmployeeList />} />
              <Route path="masters/employee/new" element={<EmployeeForm />} />
              <Route path="masters/employee/:id" element={<EmployeeForm />} />

              {/* Unit (Phase 4) */}
              <Route path="masters/unit" element={<UnitList />} />
              <Route path="masters/unit/new" element={<UnitForm />} />
              <Route path="masters/unit/:id" element={<UnitForm />} />

              {/* Product Group (Phase 4) */}
              <Route path="masters/product-group" element={<ProductGroupList />} />
              <Route path="masters/product-group/new" element={<ProductGroupForm />} />
              <Route path="masters/product-group/:id" element={<ProductGroupForm />} />

              {/* Product Master (Phase 6) */}
              <Route path="masters/product" element={<ProductList />} />
              <Route path="masters/product/new" element={<ProductForm />} />
              <Route path="masters/product/:id" element={<ProductForm />} />

              {/* Process Master (Phase 4) */}
              <Route path="masters/process-master" element={<ProcessMasterList />} />
              <Route path="masters/process-master/new" element={<ProcessMasterForm />} />
              <Route path="masters/process-master/:id" element={<ProcessMasterForm />} />

              {/* Operations Master (Phase 5) */}
              <Route path="masters/operations" element={<OperationList />} />
              <Route path="masters/operations/new" element={<OperationForm />} />
              <Route path="masters/operations/:id" element={<OperationForm />} />

              {/* Transactions Routes */}
              {/* Job Order Booking (Phase 7) */}
              <Route path="transactions/job-order" element={<JobOrderList />} />
              <Route path="transactions/job-order/new" element={<JobOrderForm />} />
              <Route path="transactions/job-order/:id" element={<JobOrderForm />} />

              {/* Lot Operation Map (Phase 8) */}
              <Route path="transactions/lot-operation-map" element={<LotOperationMapList />} />
              <Route path="transactions/lot-operation-map/new" element={<LotOperationMapForm />} />
              <Route path="transactions/lot-operation-map/:id" element={<LotOperationMapForm />} />
              <Route path="transactions/lot-operation-print" element={<LotOperationPrint />} />

              {/* Material Issue (pieces moving from step to step) */}
              <Route path="transactions/material-issue" element={<MaterialIssueList />} />

              {/* Daily Process Entry (Phase 9 - DailyWorkRntryRpt & DailyOpEntry) */}
              <Route path="transactions/daily-process-entry" element={<DailyProcessEntryList />} />
              <Route path="transactions/daily-process-entry/new" element={<DailyOpEntry />} />
              <Route path="transactions/daily-process-entry/:id" element={<DailyOpEntry />} />
              <Route path="transactions/daily-op-entry/:id" element={<DailyOpEntry />} />

              {/* Reports Routes */}
              <Route path="reports/process-work" element={<ProcessWorkReport />} />
              <Route path="reports/daily-process" element={<DailyProcessReport />} />
              <Route path="reports/salary" element={<SalaryReport />} />
              <Route path="reports/lot-group-qty" element={<LotwiseGroupwiseReport />} />

              {/* Balance Reports (new section) */}
              <Route path="balance/lot-balance" element={<LotBalanceSheet />} />
              <Route path="balance/lot-summary" element={<LotSummary />} />

              {/* Utility Routes */}
              <Route path="utility/update-attendance" element={<UpdateAttendance />} />
              <Route path="utility/spine-attendance" element={<SpineAttendance />} />

              {/* Admin (admins only): logins and rights, backups, company name + logo */}
              <Route path="admin/logins" element={<LoginList />} />
              <Route path="admin/logins/new" element={<LoginForm />} />
              <Route path="admin/logins/:id" element={<LoginForm />} />
              <Route path="admin/backups" element={<BackupsPage />} />
              <Route path="admin/branding" element={<BrandingPage />} />
            </Route>

            {/* Fallback route */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </BrandingProvider>
  );
}
