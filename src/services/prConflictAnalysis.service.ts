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
    const existingAnalysis = await this.repository.findOne({
      where: {
        pr_number: prNumber,
        repository_owner: repositoryOwner,
        repository_name: repositoryName,
      },
    });

    if (existingAnalysis) {
      existingAnalysis.conflicts_detected = conflictsDetected;
      existingAnalysis.validation_form_posted = validationFormPosted;
      existingAnalysis.analyzed_at = new Date(); 
      return await this.repository.save(existingAnalysis);
    } else {
      const analysis = new PrConflictAnalysis();
      analysis.pr_number = prNumber;
      analysis.repository_owner = repositoryOwner;
      analysis.repository_name = repositoryName;
      analysis.conflicts_detected = conflictsDetected;
      analysis.validation_form_posted = validationFormPosted;
      return await this.repository.save(analysis);
    }
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
        validation_form_posted: true,
      },
    });

    return !!analysis;
  }

  static async resetValidationFormPosted(
    prNumber: number,
    repositoryOwner: string,
    repositoryName: string
  ): Promise<void> {
    const existingAnalysis = await this.repository.findOne({
      where: {
        pr_number: prNumber,
        repository_owner: repositoryOwner,
        repository_name: repositoryName,
      },
    });

    if (existingAnalysis) {
      existingAnalysis.validation_form_posted = false;
      await this.repository.save(existingAnalysis);
    }
  }
}