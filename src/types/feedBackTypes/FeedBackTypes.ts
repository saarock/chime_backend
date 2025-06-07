export interface Feedback {
  userId: string;            
  email?: string;
  rating: number;            
  category: string
  callQuality: number;     
  easeOfUse: number;         
  wouldRecommend: boolean;
  features: string[];         
  feedback: string;          
  improvements: string;             
}