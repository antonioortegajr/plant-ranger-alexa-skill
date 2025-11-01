import axios from 'axios';

interface PlantHealthResponse {
  status: string;
  message: string;
  lastChecked: string;
  recommendations?: string[];
}

export class ApiClient {
  private apiBaseUrl: string;

  constructor() {
    this.apiBaseUrl = process.env.PLANT_RANGER_API_BASE_URL || 'https://api.plantranger.com';
  }

  async checkPlantHealth(accessToken?: string): Promise<PlantHealthResponse> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const response = await axios.get(`${this.apiBaseUrl}/health`, {
        headers,
        timeout: 10000, // 10 second timeout
      });

      console.log('API Response:', JSON.stringify(response.data, null, 2));
      console.log('API Response status code:', response.status);

      // Transform API response to our expected format
      // The actual API returns: {"status":"healthy"}
      const apiStatus = response.data.status || 'Unknown';
      console.log('Extracted status:', apiStatus);
      
      return {
        status: apiStatus,
        message: this.getStatusMessage(apiStatus),
        lastChecked: new Date().toISOString(),
        recommendations: this.getRecommendations(apiStatus),
      };

    } catch (error) {
      console.error('Error calling plant health API:', error);
      
      // Handle different types of errors
      if (axios.isAxiosError(error)) {
        if (error.response && error.response.status >= 500) {
          throw new Error('Plant health service is temporarily unavailable');
        } else if (error.code === 'ECONNABORTED') {
          throw new Error('Request timeout - please try again');
        }
      }
      
      throw new Error('Failed to retrieve plant health data');
    }
  }

  private getStatusMessage(status: string): string {
    switch (status.toLowerCase()) {
      case 'healthy':
        return 'Your plants are doing great! They appear to be in excellent health.';
      case 'warning':
        return 'Your plants need some attention. There are a few issues that should be addressed.';
      case 'critical':
        return 'Your plants need immediate care. Please check them as soon as possible.';
      default:
        return 'Plant health status is currently unknown. Please check your plants manually.';
    }
  }

  private getRecommendations(status: string): string[] {
    switch (status.toLowerCase()) {
      case 'healthy':
        return [
          'Continue your current care routine',
          'Monitor soil moisture regularly',
          'Check for pests weekly'
        ];
      case 'warning':
        return [
          'Check soil moisture levels',
          'Ensure adequate lighting',
          'Review watering schedule',
          'Check for signs of pests or disease'
        ];
      case 'critical':
        return [
          'Check soil moisture immediately',
          'Inspect for pests or disease',
          'Consider adjusting watering schedule',
          'Ensure proper drainage',
          'Check lighting conditions'
        ];
      default:
        return [
          'Check soil moisture',
          'Inspect plant leaves and stems',
          'Ensure adequate lighting',
          'Review watering schedule'
        ];
    }
  }

  async getPlantDetails(accessToken: string, plantId?: string): Promise<any> {
    try {
      const endpoint = plantId ? 
        `${this.apiBaseUrl}/plants/${plantId}` : 
        `${this.apiBaseUrl}/plants`;
      
      const response = await axios.get(endpoint, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      return response.data;

    } catch (error) {
      console.error('Error getting plant details:', error);
      throw new Error('Failed to retrieve plant details');
    }
  }

  async getPlantRecommendations(accessToken: string): Promise<string[]> {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/plants/recommendations`, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      return response.data.recommendations || [];

    } catch (error) {
      console.error('Error getting plant recommendations:', error);
      return ['Unable to retrieve recommendations at this time'];
    }
  }
}
