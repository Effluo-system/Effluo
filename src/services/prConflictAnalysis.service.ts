import { AppDataSource } from '../server/server.ts';
import { PrConflictAnalysis } from '../entities/prConflictAnalysis.entity.ts';

export class PrConflictAnalysisService {
  private static repository = AppDataSource.getRepository(PrConflictAnalysis);

  static async trackAnalysis(
    prNumber: number,
    repositoryOwner: string,
    repositoryName: string,
    conflictsDetected: boolean,
    validationFormPosted: boolean
  ): Promise<PrConflictAnalysis> {
    const analysis = new PrConflictAnalysis();
    analysis.pr_number = prNumber;
    analysis.repository_owner = repositoryOwner;
    analysis.repository_name = repositoryName;
    analysis.conflicts_detected = conflictsDetected;
    analysis.validation_form_posted = validationFormPosted;

    return await this.repository.save(analysis);
  }

  static async wasAnalyzedWithValidationForm(
    prNumber: number,
    repositoryOwner: string,
    repositoryName: string
  ): Promise<boolean> {
    const analysis = await this.repository.findOne({
      where: {
        pr_number: prNumber,
        repository_owner: repositoryOwner,
        repository_name: repositoryName,
        validation_form_posted: true
      }
    });

    return !!analysis;
  }

  static async findLatestAnalysisForPR(
    prNumber: number,
    repositoryOwner: string,
    repositoryName: string
  ): Promise<PrConflictAnalysis | null> {
    return await this.repository.findOne({
      where: {
        pr_number: prNumber,
        repository_owner: repositoryOwner,
        repository_name: repositoryName
      },
      order: { analyzed_at: 'DESC' }
    });
  }
  
  static async getPRValidationStatus(
    prNumber: number,
    repositoryOwner: string,
    repositoryName: string,
    prUpdatedAt: Date
  ): Promise<{
    shouldAnalyze: boolean;
    hasValidationForm: boolean;
  }> {
    const latestAnalysis = await this.findLatestAnalysisForPR(
      prNumber, 
      repositoryOwner, 
      repositoryName
    );
    
    if (!latestAnalysis) {
      return { shouldAnalyze: true, hasValidationForm: false };
    }
    
    // Check if the analysis was performed after the PR was last updated
    const analysisDate = new Date(latestAnalysis.analyzed_at);
    const prUpdateDate = new Date(prUpdatedAt);
    
    if (analysisDate < prUpdateDate) {
      // PR was updated after the last analysis, should analyze again
      return { shouldAnalyze: true, hasValidationForm: false };
    }
    
    return { 
      shouldAnalyze: false, 
      hasValidationForm: latestAnalysis.validation_form_posted 
    };
  }
}