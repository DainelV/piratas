const API = {
    async request(endpoint, method = 'GET', body = null) {
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      };
  
      if (body) {
        options.body = JSON.stringify(body);
      }
  
      const response = await fetch(`/api${endpoint}`, options);
      const data = await response.json();
  
      if (!response.ok) {
        throw new Error(data.error || 'Error en la solicitud');
      }
  
      return data;
    },
  
    async get(endpoint) {
      return this.request(endpoint, 'GET');
    },
  
    async post(endpoint, body) {
      return this.request(endpoint, 'POST', body);
    },
  
    async put(endpoint, body) {
      return this.request(endpoint, 'PUT', body);
    }
  };