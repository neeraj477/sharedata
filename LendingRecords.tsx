import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, Mail } from 'lucide-react';
import { formatCurrency } from '@/utils/loanCalculations';
import { useAuth } from '@/contexts/AuthContext';

interface Borrower {
  id: string;
  name: string;
  email: string;
  principalAmount: number;
  interestRate: number;
  tenure: number;          // months
  emi?: number;            // monthly EMI
  createdAt: string;
}

/** Calculate EMI using the standard amortization formula. Handles 0% gracefully. */
function computeEmi(principal: number, rate: number, tenure: number): number {
  if (!tenure || tenure <= 0) return 0;
  const monthlyRate = rate / (12 * 100);
  if (monthlyRate === 0) return principal / tenure;
  const pow = Math.pow(1 + monthlyRate, tenure);
  return (principal * monthlyRate * pow) / (pow - 1);
}

// Prefer environment-configured API base; fall back to localhost backend.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const LendingRecords: React.FC = () => {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [borrowerName, setBorrowerName] = useState('');
  const [borrowerEmail, setBorrowerEmail] = useState('');
  const [principalAmount, setPrincipalAmount] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [tenure, setTenure] = useState('');

  const [borrowers, setBorrowers] = useState<Borrower[]>([]);
  const [isSending, setIsSending] = useState(false);

  // Load borrowers from localStorage on mount
  useEffect(() => {
    const saved: Borrower[] = JSON.parse(localStorage.getItem('loanManagement_borrowers') || '[]');
    const normalized = saved.map((b) => ({
      ...b,
      emi: typeof b.emi === 'number' ? b.emi : computeEmi(b.principalAmount, b.interestRate, b.tenure),
    }));
    setBorrowers(normalized);
  }, []);

  const persistBorrowers = (list: Borrower[]) => {
    localStorage.setItem('loanManagement_borrowers', JSON.stringify(list));
  };

  /** Send borrower loan details email via backend */
  const { user } = useAuth();
  const sendEmail = async (borrower: Borrower) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/send-borrower-mail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send a payload flexible enough for different backend field expectations
        body: JSON.stringify({
          name: borrower.name,
          email: borrower.email,
          principal: borrower.principalAmount,
          principalAmount: borrower.principalAmount,
          interestRate: borrower.interestRate,
          rate: borrower.interestRate,
          tenure: borrower.tenure,
          emi: borrower.emi,
          lenderName: user?.name 
        }),
      });

      const data = await response.json();
      if (data.success) {
        toast({
          title: 'Email Sent!',
          description: `Loan details emailed to ${borrower.email}.`,
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Email Failed',
          description: data.message || 'Unable to send email.'
        });
      }
    } catch (error) {
      console.error('Email error', error);
      toast({
        variant: 'destructive',
        title: 'Email Error',
        description: 'Network or server issue while sending email.'
      });
    }
  };

  const addBorrower = async () => {
    if (!borrowerName.trim() || !borrowerEmail.trim() || !principalAmount || !interestRate || !tenure) {
      toast({
        variant: 'destructive',
        title: 'Missing Fields',
        description: 'Please fill in all the borrower details.',
      });
      return;
    }

    const principal = Number(principalAmount);
    const rate = Number(interestRate);
    const months = Number(tenure);

    if (principal <= 0 || months <= 0 || rate < 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid Values',
        description: 'Please provide valid principal, interest rate, and tenure.',
      });
      return;
    }

    const emi = computeEmi(principal, rate, months);

    const newBorrower: Borrower = {
      id: Date.now().toString(),
      name: borrowerName.trim(),
      email: borrowerEmail.trim(),
      principalAmount: principal,
      interestRate: rate,
      tenure: months,
      emi,
      createdAt: new Date().toISOString(),
    };

    // Save locally
    const updatedBorrowers = [...borrowers, newBorrower];
    setBorrowers(updatedBorrowers);
    persistBorrowers(updatedBorrowers);

    // Send email
    setIsSending(true);
    await sendEmail(newBorrower);
    setIsSending(false);

    // Reset form
    setBorrowerName('');
    setBorrowerEmail('');
    setPrincipalAmount('');
    setInterestRate('');
    setTenure('');
    setShowForm(false);

    toast({
      title: 'Borrower Added!',
      description: 'Borrower details saved successfully.',
    });
  };

  const computedEmiPreview =
    borrowerName || borrowerEmail || principalAmount || interestRate || tenure
      ? computeEmi(Number(principalAmount) || 0, Number(interestRate) || 0, Number(tenure) || 0)
      : null;

  return (
    <div className="space-y-6">
      {/* Add Borrower Button */}
      {!showForm ? (
        <div className="flex justify-end">
          <Button onClick={() => setShowForm(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add Borrower
          </Button>
        </div>
      ) : (
        /* Borrower Form */
        <Card className="bg-gradient-card border-border shadow-card">
          <CardHeader>
            <CardTitle>Add Borrower</CardTitle>
            <CardDescription>Enter borrower details below</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Borrower Name */}
            <div>
              <Label htmlFor="borrowerName">Borrower Name</Label>
              <Input
                id="borrowerName"
                value={borrowerName}
                onChange={(e) => setBorrowerName(e.target.value)}
                placeholder="Enter borrower's name"
              />
            </div>
            {/* Borrower Email */}
            <div>
              <Label htmlFor="borrowerEmail">Borrower Email</Label>
              <Input
                id="borrowerEmail"
                type="email"
                value={borrowerEmail}
                onChange={(e) => setBorrowerEmail(e.target.value)}
                placeholder="Enter borrower's email"
              />
            </div>
            {/* Principal Amount */}
            <div>
              <Label htmlFor="principalAmount">Principal Amount (₹)</Label>
              <Input
                id="principalAmount"
                type="number"
                value={principalAmount}
                onChange={(e) => setPrincipalAmount(e.target.value)}
                placeholder="Enter principal amount"
              />
            </div>
            {/* Rate of Interest */}
            <div>
              <Label htmlFor="interestRate">Rate of Interest (% p.a.)</Label>
              <Input
                id="interestRate"
                type="number"
                step="0.1"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                placeholder="Enter interest rate"
              />
            </div>
            {/* Tenure */}
            <div>
              <Label htmlFor="tenure">Tenure (months)</Label>
              <Input
                id="tenure"
                type="number"
                value={tenure}
                onChange={(e) => setTenure(e.target.value)}
                placeholder="Enter tenure in months"
              />
            </div>

            {computedEmiPreview && computedEmiPreview > 0 && (
              <div className="p-3 bg-muted rounded">
                <p className="text-sm text-muted-foreground">Calculated EMI:</p>
                <p className="text-lg font-bold text-foreground">{formatCurrency(computedEmiPreview)}</p>
              </div>
            )}

            {/* Buttons */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button disabled={isSending} onClick={addBorrower}>
                <Mail className="mr-2 h-4 w-4" />
                {isSending ? 'Sending...' : 'Save & Send Email'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Borrower List Table */}
      <Card className="bg-gradient-card border-border shadow-card">
        <CardHeader>
          <CardTitle>Borrower Records</CardTitle>
          <CardDescription>List of all borrowers</CardDescription>
        </CardHeader>
        <CardContent>
          {borrowers.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No borrowers found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-border rounded-lg">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-2 text-left">Name</th>
                    <th className="p-2 text-left">Email</th>
                    <th className="p-2 text-left">Principal</th>
                    <th className="p-2 text-left">Rate (%)</th>
                    <th className="p-2 text-left">Tenure (m)</th>
                    <th className="p-2 text-left">EMI</th>
                    <th className="p-2 text-left">Created On</th>
                  </tr>
                </thead>
                <tbody>
                  {borrowers.map((b) => {
                    const emi = typeof b.emi === 'number' ? b.emi : computeEmi(b.principalAmount, b.interestRate, b.tenure);
                    return (
                      <tr key={b.id} className="border-t border-border">
                        <td className="p-2">{b.name}</td>
                        <td className="p-2">{b.email}</td>
                        <td className="p-2">{formatCurrency(b.principalAmount)}</td>
                        <td className="p-2">{b.interestRate}</td>
                        <td className="p-2">{b.tenure}</td>
                        <td className="p-2">{formatCurrency(emi)}</td>
                        <td className="p-2">{new Date(b.createdAt).toLocaleDateString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LendingRecords;

