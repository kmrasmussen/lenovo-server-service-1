self.addEventListener('push', function(event) {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/android-chrome-192x192.png',
      badge: '/android-chrome-192x192.png',
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
      },
    }
    event.waitUntil(self.registration.showNotification(data.title, options));
  }
});

self.addEventListener('notificationClick', function(event) {
  event.notification.close();
  event.waitUntil(client.openWindow('/'));
});
