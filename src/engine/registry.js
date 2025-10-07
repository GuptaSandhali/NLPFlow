(function (global) {
  const basePath = 'src/nodes';
  const pending = {};

  const registry = {
    modules: {},
    register(type, mod) {
      this.modules[type] = mod || {};
    },
    isLoaded(type) {
      return !!this.modules[type];
    },
    ensureLoaded(type) {
      if (this.isLoaded(type)) return Promise.resolve();
      if (pending[type]) return pending[type];

      pending[type] = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.async = true;
        const cacheBust = Date.now();
        script.src = `${basePath}/${type}.js?v=${cacheBust}`;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load node script: ${type}`));
        document.head.appendChild(script);
      });
      return pending[type];
    },
    async execute(type, ctx) {
      if (!this.isLoaded(type)) await this.ensureLoaded(type);
      const mod = this.modules[type];
      if (!mod || typeof mod.execute !== 'function') {
        throw new Error(`Node not registered or missing execute(): ${type}`);
      }
      return mod.execute(ctx || {});
    }
  };

  global.NodeRegistry = registry;
})(window);
