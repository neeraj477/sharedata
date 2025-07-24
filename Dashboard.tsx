import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger
} from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import DashboardHeader from '@/components/Dashboard/DashboardHeader';
import EMICalculator from '@/components/EMICalculator/EMICalculator';
import LendingRecords from '@/components/LendingRecords/LendingRecords';
import { useAuth } from '@/contexts/AuthContext';
import { Loan, Payment } from '@/types/loan';
import { formatCurrency } from '@/utils/loanCalculations';
import {
  TrendingUp, DollarSign, Calendar, PieChart, CreditCard, Activity
} from 'lucide-react';
import { useLoans } from '@/hooks/useLoans';
import ChatBot from '@/components/ChatBot';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

// Types
interface DashboardStats {
  totalLoans: number;
  activeLoans: number;
  totalPrincipal: number;
  totalEMI: number;
  completedLoans: number;
}

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { loans, loading, error, refetch } = useLoans();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [installmentsPaid, setInstallmentsPaid] = useState<{ [key: string]: number }>({});
  const [isProcessingPayment, setIsProcessingPayment] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    totalLoans: 0,
    activeLoans: 0,
    totalPrincipal: 0,
    totalEMI: 0,
    completedLoans: 0,
  });
  const { toast } = useToast();

  // Fetch user payments for current loans
  useEffect(() => {
    const fetchPayments = async () => {
      if (!user || !loans) return;
      try {
        const response = await fetch(`http://localhost:5000/api/payments/${user.id}`);
        const allPayments: Payment[] = await response.json();
        const userPayments = allPayments.filter((payment: Payment) =>
          loans.some((loan) => loan.loanId === payment.loanId)
        );
        setPayments(userPayments);
      } catch (error) {
        console.error('Error fetching payments:', error);
      }
    };
    fetchPayments();
  }, [user, loans]);

  // Fetch stats from backend
  useEffect(() => {
    const fetchStats = async () => {
      if (!user) return;
      try {
        const response = await fetch(`http://localhost:5000/api/stats/${user.id}`);
        if (!response.ok) throw new Error('Failed to fetch stats');
        const statsData = await response.json();
        setStats(statsData);
      } catch (error) {
        console.error('Error fetching stats:', error);
      }
    };
    fetchStats();
  }, [user, loans]);

  // Calculate stats client-side (for fallback/UI quickness)
  useEffect(() => {
    if (loans && loans.length > 0) {
      const activeLoans = loans.filter((loan) => loan.status === 'active');
      const completedLoans = loans.filter((loan) => loan.status === 'completed');
      setStats({
        totalLoans: loans.length,
        activeLoans: activeLoans.length,
        totalPrincipal: loans.reduce((sum, loan) => sum + loan.principalAmount, 0),
        totalEMI: activeLoans.reduce((sum, loan) => sum + loan.emiAmount, 0),
        completedLoans: completedLoans.length,
      });
    }
  }, [loans]);

  // Sync installments paid
  useEffect(() => {
    if (loans) {
      const initial: { [key: string]: number } = {};
      for (const loan of loans) {
        initial[loan.loanId] = loan.paidInstallments || 0;
      }
      setInstallmentsPaid(initial);
    }
  }, [loans]);

  // ---- MAIN MODIFICATION STARTS HERE ----
  const handlePayment = async (loanId: string) => {
    if (!user || !loans) return;
    setIsProcessingPayment(loanId);

    try {
      const currentLoan = loans.find(l => l.loanId === loanId);
      if (!currentLoan) return;

      const alreadyPaid = installmentsPaid[loanId] || 0;
      // Already completed
      if (alreadyPaid >= currentLoan.tenure) {
        toast({
          title: "ℹ️ Loan Completed",
          description: "This loan has already been fully paid.",
        });
        setIsProcessingPayment(null);
        return;
      }

      // EMI & interest split
      const monthlyRate = currentLoan.interestRate / 1200; // e.g. 12%/12/100
      const interestPaid = currentLoan.remainingPrincipal * monthlyRate;
      const principalPaid = currentLoan.emiAmount - interestPaid;
      const newPrincipal = Math.max(0, currentLoan.remainingPrincipal - principalPaid);

      // The new installment count after this payment
      const installments = alreadyPaid + 1;

      // Calculate next due date: if nextDueDate exits, base future on it, otherwise on createdAt
      // Always add 1 month for each payment
      const baseDate = currentLoan.nextDueDate
        ? new Date(currentLoan.nextDueDate)
        : new Date(currentLoan.createdAt);
      const nextDueDate = new Date(baseDate);
      nextDueDate.setMonth(nextDueDate.getMonth() + 1);

      // Completed after this payment?
      const isCompleted = installments >= currentLoan.tenure;
      const newStatus = isCompleted ? 'completed' : 'active';

      // Update installmentsPaid for UI
      setInstallmentsPaid(prev => ({
        ...prev,
        [loanId]: installments,
      }));

      // API call
      const response = await fetch(`http://localhost:5000/api/loans/${loanId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          paidInstallments: installments,
          remainingPrincipal: newPrincipal,
          nextDueDate: isCompleted ? null : nextDueDate.toISOString(),
          status: newStatus,
        }),
      });

      if (!response.ok) throw new Error('Payment API error');

      toast({
        title: isCompleted ? "🎉 Loan Completed!" : "✅ Payment Successful",
        description: `
          Installments: ${installments}/${currentLoan.tenure}
          Remaining Principal: ${formatCurrency(newPrincipal)}
          ${!isCompleted ? `Next Due: ${nextDueDate.toLocaleDateString()}` : ''}
        `,
      });

      await refetch();
    } catch (error) {
      toast({ title: '❌ Payment Failed', description: String(error) });
      console.error(error);
    } finally {
      setIsProcessingPayment(null);
    }
  };
  // ---- MAIN MODIFICATION ENDS HERE ----

  return (
    <div className="min-h-screen bg-gradient-hero">
      <DashboardHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-foreground mb-2">
            Welcome back, {user?.name}!
          </h2>
          <p className="text-muted-foreground">
            Manage your loans and track payments professionally
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <Card className="bg-gradient-card border-border shadow-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Loans</p>
                  <p className="text-2xl font-bold text-foreground">{stats.totalLoans}</p>
                </div>
                <CreditCard className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card border-border shadow-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Loans</p>
                  <p className="text-2xl font-bold text-foreground">{stats.activeLoans}</p>
                </div>
                <Activity className="h-8 w-8 text-secondary" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card border-border shadow-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Principal</p>
                  <p className="text-2xl font-bold text-foreground">
                    {formatCurrency(stats.totalPrincipal)}
                  </p>
                </div>
                <DollarSign className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card border-border shadow-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Monthly EMI</p>
                  <p className="text-2xl font-bold text-foreground">
                    {formatCurrency(stats.totalEMI)}
                  </p>
                </div>
                <Calendar className="h-8 w-8 text-secondary" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card border-border shadow-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Completed</p>
                  <p className="text-2xl font-bold text-foreground">{stats.completedLoans}</p>
                </div>
                <PieChart className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="calculator" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:grid-cols-5">
            <TabsTrigger value="calculator">EMI Calculator</TabsTrigger>
            <TabsTrigger value="loans">My Loans</TabsTrigger>
            <TabsTrigger value="payments">Payment History</TabsTrigger>
            <TabsTrigger value="lending">Lending Records</TabsTrigger>
            <TabsTrigger value="schedule" className="hidden lg:flex">Schedule</TabsTrigger>
          </TabsList>

          <TabsContent value="calculator">
            <EMICalculator />
          </TabsContent>

          <TabsContent value="loans">
            <Card className="bg-gradient-card border-border shadow-card">
              <CardHeader>
                <CardTitle>My Loans</CardTitle>
                <CardDescription>
                  View and manage all your loans in one place
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                    <p className="text-muted-foreground mt-2">Loading your loans...</p>
                  </div>
                ) : (loans && loans.length === 0) ? (
                  <div className="text-center py-8">
                    <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No loans found. Create your first loan using the EMI Calculator.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {loans && loans.map((loan) => (
                      <div key={loan.loanId} className="p-4 bg-background rounded-lg border border-border">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-semibold text-foreground">
                              {formatCurrency(loan.principalAmount)} Loan
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Created on {new Date(loan.createdAt).toLocaleDateString()}
                              {loan.nextDueDate && (
                                <span className="ml-2">• Next Due: {new Date(loan.nextDueDate).toLocaleDateString()}</span>
                              )}
                            </p>
                          </div>
                          <Badge variant={loan.status === 'active' ? 'default' : 'secondary'}>
                            {loan.status}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">EMI Amount</p>
                            <p className="font-medium">{formatCurrency(loan.emiAmount)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Interest Rate</p>
                            <p className="font-medium">{loan.interestRate}% p.a.</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Tenure</p>
                            <p className="font-medium">{loan.tenure} months</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Type</p>
                            <p className="font-medium capitalize">{loan.loanType.replace('-', ' ')}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payments">
            <Card className="bg-gradient-card border-border shadow-card">
              <CardHeader>
                <CardTitle>Payment History</CardTitle>
                <CardDescription>
                  Track all your loan payments and remaining balances
                </CardDescription>
              </CardHeader>
              <CardContent>
                {payments.length === 0 ? (
                  <div className="text-center py-8">
                    <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No payments recorded yet. Start making payments to see your history here.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {payments.map((payment) => (
                      <div key={payment.id} className="p-4 bg-background rounded-lg border border-border">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-semibold text-foreground">
                              {formatCurrency(payment.amount)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Paid on {new Date(payment.paymentDate).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">Remaining Balance</p>
                            <p className="font-medium">{formatCurrency(payment.remainingBalance)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="lending">
            <LendingRecords />
          </TabsContent>

          <TabsContent value="schedule">
            <Card className="bg-gradient-card border-border shadow-card">
              <CardHeader>
                <CardTitle>Payment Schedule</CardTitle>
                <CardDescription>
                  Track your loan payments and upcoming EMIs
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                    <p className="text-muted-foreground mt-2">Loading your loans...</p>
                  </div>
                ) : (loans && loans.length === 0) ? (
                  <div className="text-center py-8">
                    <PieChart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No active loans found.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {loans && loans.map((loan) => (
                      <div key={loan.loanId} className="bg-background rounded-lg border border-border p-4">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="font-semibold text-lg">
                              {formatCurrency(loan.principalAmount)} Loan
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              Started on {new Date(loan.createdAt).toLocaleDateString()}
                              {loan.nextDueDate && (
                                <span className="ml-2">• Next Payment: {new Date(loan.nextDueDate).toLocaleDateString()}</span>
                              )}
                            </p>
                          </div>
                          <Badge variant={loan.status === 'active' ? 'default' : 'secondary'}>
                            {loan.status}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                          <div className="bg-muted p-3 rounded-lg">
                            <p className="text-sm text-muted-foreground">Monthly EMI</p>
                            <p className="font-semibold">{formatCurrency(loan.emiAmount)}</p>
                          </div>
                          <div className="bg-muted p-3 rounded-lg">
                            <p className="text-sm text-muted-foreground">Remaining Principal</p>
                            <p className="font-semibold">{formatCurrency(loan.remainingPrincipal)}</p>
                          </div>
                          <div className="bg-muted p-3 rounded-lg">
                            <p className="text-sm text-muted-foreground">Next Due Date</p>
                            <p className="font-semibold">
                              {loan.nextDueDate
                                ? new Date(loan.nextDueDate).toLocaleDateString()
                                : 'Not scheduled'}
                            </p>
                          </div>
                          <div className="bg-muted p-3 rounded-lg">
                            <p className="text-sm text-muted-foreground">Installments Paid</p>
                            <p className="font-semibold">
                              {installmentsPaid[loan.loanId] || 0} / {loan.tenure}
                            </p>
                          </div>
                        </div>

                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-sm text-muted-foreground">Progress</p>
                            <div className="w-full bg-muted rounded-full h-2 mt-1">
                              <div
                                className="bg-primary rounded-full h-2"
                                style={{
                                  width: `${((installmentsPaid[loan.loanId] || 0) / loan.tenure) * 100}%`,
                                }}
                              />
                            </div>
                          </div>
                          <Button
                            onClick={() => handlePayment(loan.loanId)}
                            disabled={
                              loan.status !== 'active' ||
                              isProcessingPayment === loan.loanId
                            }
                            variant="default"
                            size="sm"
                          >
                            {isProcessingPayment === loan.loanId
                              ? 'Processing...'
                              : `Pay ${formatCurrency(loan.emiAmount)}`}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
      <ChatBot />
    </div>
  );
};

export default Dashboard;
