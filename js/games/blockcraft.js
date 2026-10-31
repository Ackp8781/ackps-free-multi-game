// BlockCraft: a full voxel survival game. The engine lives in js/craft; this file only starts it.
App.register({
  id: 'craft', name: 'BlockCraft', icon: '⛏️', online: true,
  desc: 'Endless procedural worlds. Survival, Creative, Adventure and Hardcore, solo or with friends.',
  async mount(ctx) {
    ctx.clear();
    await loadThree();
    if (!ctx.stage.isConnected) return;
    CraftGame.start(ctx);
  },
});
