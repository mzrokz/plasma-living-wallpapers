import QtQuick
import org.kde.taskmanager as TaskManager

// Tells whether a window is hiding this screen's wallpaper.
Item {
    id: watcher

    property rect screenGeometry
    property bool includeMaximized: true
    property bool covered: false

    onIncludeMaximizedChanged: settle.restart()

    TaskManager.VirtualDesktopInfo { id: desktops }
    TaskManager.ActivityInfo { id: activities }

    TaskManager.TasksModel {
        id: tasks
        groupMode: TaskManager.TasksModel.GroupDisabled
        screenGeometry: watcher.screenGeometry
        virtualDesktop: desktops.currentDesktop
        activity: activities.currentActivity
        filterByScreen: true
        filterByVirtualDesktop: true
        filterByActivity: true
        filterMinimized: true
        onDataChanged: settle.restart()
        onCountChanged: settle.restart()
    }

    // Window changes arrive in bursts; look once they stop, and after the
    // maximize animation has finished uncovering or covering the desktop.
    Timer {
        id: settle
        interval: 250
        running: true
        onTriggered: {
            const Role = TaskManager.AbstractTasksModel;
            let found = false;
            for (let i = 0; i < tasks.count && !found; ++i) {
                const t = tasks.index(i, 0);
                found = tasks.data(t, Role.IsWindow) && !tasks.data(t, Role.IsMinimized)
                     && (tasks.data(t, Role.IsFullScreen) || (watcher.includeMaximized && tasks.data(t, Role.IsMaximized)));
            }
            watcher.covered = !!found;
        }
    }
}
