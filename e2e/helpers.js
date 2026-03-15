async function launchQuietRoom() {
  await device.launchApp({
    newInstance: true,
    launchArgs: {
      detoxEnableSynchronization: 0,
    },
  });

  await device.disableSynchronization();
}

module.exports = {
  launchQuietRoom,
};
