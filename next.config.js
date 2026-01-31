// Source - https://stackoverflow.com/a/68098547

// Posted by Arjun Kava, modified by community. See post 'Timeline' for change history

// Retrieved 2026-01-31, License - CC BY-SA 4.0



module.exports = {
  webpack5: true,
  webpack: (config) => {
    config.resolve.fallback = { fs: false };

    return config;
  },
};

