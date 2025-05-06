import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

let sessionTreeProvider: SessionProvider;

export function activate(context: vscode.ExtensionContext) {

  registerSaveSessionCommand(context);
  registerRestoreSessionCommand(context);
  registerRestoreNamedSessionCommand(context);
  registerDeleteSessionCommand(context);
  registerOverwriteSessionCommand(context);
  registerSidebarTreeView(context);
}

export function deactivate() {}


//#region Methods

function registerSaveSessionCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('session-builder.saveSession', async () => {
    const sessionName = await vscode.window.showInputBox({
      prompt: 'Enter a name for this session',
      placeHolder: 'e.g., bugfixing, db-migration, etc.'
    });

    if (!sessionName) {
      vscode.window.showWarningMessage('Session name is required.');
      return;
    }

    const openDocs = vscode.workspace.textDocuments
      .filter(doc => !doc.isUntitled && !doc.isClosed && doc.uri.scheme === 'file')
      .map(doc => doc.fileName);

  

    if (openDocs.length === 0) {
      vscode.window.showInformationMessage('No open files to save.');
      return;
    }

    const folderPath = path.join(context.globalStorageUri.fsPath, 'sessions');
    const filePath = path.join(folderPath, `${sessionName}.json`);

    await fs.promises.mkdir(folderPath, { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify(openDocs, null, 2), 'utf8');

    vscode.window.showInformationMessage(`Session "${sessionName}" saved with ${openDocs.length} files.`);

    sessionTreeProvider?.refresh(); // ✅ Refresh the sidebar session list
  });

  context.subscriptions.push(disposable);
}

function registerRestoreSessionCommand(context: vscode.ExtensionContext) {
  const restoreCommand = vscode.commands.registerCommand('session-builder.restoreSession', async () => {
    const sessionFolder = path.join(context.globalStorageUri.fsPath, 'sessions');

    if (!fs.existsSync(sessionFolder)) {
      vscode.window.showWarningMessage('No sessions have been saved yet.');
      return;
    }

    const files = fs.readdirSync(sessionFolder).filter(file => file.endsWith('.json'));

    if (files.length === 0) {
      vscode.window.showWarningMessage('No sessions found.');
      return;
    }

    const picked = await vscode.window.showQuickPick(files, {
      placeHolder: 'Select a session to restore'
    });

    if (!picked) {return};

    const sessionFilePath = path.join(sessionFolder, picked);
    const filePaths: string[] = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8'));

    for (const file of filePaths) {
      try {
        const doc = await vscode.workspace.openTextDocument(file);
        vscode.window.showTextDocument(doc, { preview: false, preserveFocus: true });
      } catch {
        vscode.window.showWarningMessage(`Failed to open file: ${file}`);
      }
    }

    vscode.window.showInformationMessage(`Restored session "${picked.replace('.json', '')}".`);
  });

  context.subscriptions.push(restoreCommand);
}

function registerRestoreNamedSessionCommand(context: vscode.ExtensionContext) {
  const restoreNamedSession = vscode.commands.registerCommand('session-builder.restoreNamedSession', async (fileName: string) => {
    const hasOpenFiles = vscode.workspace.textDocuments.some(doc => !doc.isUntitled && !doc.isClosed);

    if (hasOpenFiles) {
      const confirm = await vscode.window.showQuickPick(
        ['Yes — Save and Continue', 'No — Just Switch', 'Cancel'],
        { placeHolder: 'Save current open files as a session before switching?' }
      );

      if (confirm === 'Yes — Save and Continue') {
        const unsavedDocs = vscode.workspace.textDocuments.filter(doc => doc.isDirty && !doc.isUntitled);
        if (unsavedDocs.length > 0) {
          const saveConfirm = await vscode.window.showQuickPick(
            ['💾 Save and Continue', '⚠️ Continue Without Saving', 'Cancel'],
            { placeHolder: `You have ${unsavedDocs.length} unsaved file(s). What do you want to do?` }
          );

          if (saveConfirm === '💾 Save and Continue') {
            await vscode.workspace.saveAll();
          } else if (saveConfirm === 'Cancel') {
            return;
          }
        }

        const openDocs = vscode.workspace.textDocuments
          .filter(doc => !doc.isUntitled && !doc.isClosed && doc.uri.scheme === 'file')
          .map(doc => doc.fileName);

        const sessionName = await vscode.window.showInputBox({
          prompt: 'Enter a name to save your current session',
          placeHolder: 'e.g., temp-changes, debug-work'
        });

        if (sessionName) {
          const folderPath = path.join(context.globalStorageUri.fsPath, 'sessions');
          const savePath = path.join(folderPath, `${sessionName}.json`);
          await fs.promises.mkdir(folderPath, { recursive: true });
          await fs.promises.writeFile(savePath, JSON.stringify(openDocs, null, 2), 'utf8');
          vscode.window.showInformationMessage(`Session "${sessionName}" saved.`);
          sessionTreeProvider?.refresh();
        }
      } else if (confirm === 'Cancel') {
        return;
      }
    }

    await vscode.commands.executeCommand('workbench.action.closeAllEditors');

    const sessionFolder = path.join(context.globalStorageUri.fsPath, 'sessions');
    const sessionFilePath = path.join(sessionFolder, fileName);

    if (!fs.existsSync(sessionFilePath)) {
      vscode.window.showWarningMessage(`Session file not found: ${fileName}`);
      return;
    }

    const filePaths: string[] = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8'));

    for (const file of filePaths) {
      try {
        const doc = await vscode.workspace.openTextDocument(file);
        vscode.window.showTextDocument(doc, { preview: false, preserveFocus: true });
      } catch {
        vscode.window.showWarningMessage(`Failed to open file: ${file}`);
      }
    }

    vscode.window.showInformationMessage(`Restored session "${fileName.replace('.json', '')}".`);
  });

  context.subscriptions.push(restoreNamedSession);
}

function registerDeleteSessionCommand(context: vscode.ExtensionContext) {
  const cmd = vscode.commands.registerCommand('session-builder.deleteSession', async (fileName?: string) => {
    if (!fileName || typeof fileName !== 'string' || !fileName.endsWith('.json')) {
      vscode.window.showErrorMessage('Invalid session file provided for deletion.');
      return;
    }

    const sessionName = path.basename(fileName, '.json');
    const sessionFolder = path.join(context.globalStorageUri.fsPath, 'sessions');
    const filePath = path.join(sessionFolder, fileName);

    const confirm = await vscode.window.showWarningMessage(
      `Delete session "${sessionName}"?`,
      { modal: true },
      'Delete'
    );

    if (confirm === 'Delete' && fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      vscode.window.showInformationMessage(`Deleted session "${sessionName}".`);
      sessionTreeProvider?.refresh();
    }
  });

  context.subscriptions.push(cmd);
}

function registerOverwriteSessionCommand(context: vscode.ExtensionContext) {
  const cmd = vscode.commands.registerCommand('session-builder.overwriteSession', async (fileName: string) => {
    if (!fileName || typeof fileName !== 'string' || !fileName.endsWith('.json')) {
      vscode.window.showErrorMessage('Invalid session file provided for overwrite.');
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Are you sure you want to overwrite "${path.basename(fileName, '.json')}" with currently open files?`,
      { modal: true },
      'Overwrite'
    );

    if (confirm !== 'Overwrite') return;

    const unsavedDocs = vscode.workspace.textDocuments.filter(doc => doc.isDirty && !doc.isUntitled);
    if (unsavedDocs.length > 0) {
      const saveConfirm = await vscode.window.showQuickPick(
        ['💾 Save and Continue', '⚠️ Continue Without Saving', 'Cancel'],
        { placeHolder: `You have ${unsavedDocs.length} unsaved file(s). What do you want to do?` }
      );

      if (saveConfirm === '💾 Save and Continue') {
        await vscode.workspace.saveAll();
      } else if (saveConfirm === 'Cancel') {
        return; // Abort
      }
    }

    const openDocs = vscode.workspace.textDocuments
      .filter(doc => !doc.isUntitled && !doc.isClosed && doc.uri.scheme === 'file')
      .map(doc => doc.fileName);

    if (openDocs.length === 0) {
      vscode.window.showInformationMessage('No open files to save.');
      return;
    }

    const folderPath = path.join(context.globalStorageUri.fsPath, 'sessions');
    const filePath = path.join(folderPath, fileName);

    await fs.promises.writeFile(filePath, JSON.stringify(openDocs, null, 2), 'utf8');

    vscode.window.showInformationMessage(`Session "${path.basename(fileName, '.json')}" overwritten with ${openDocs.length} files.`);
    sessionTreeProvider?.refresh();
  });

  context.subscriptions.push(cmd);
}




//#endregion


//#region Sidebar View

function registerSidebarTreeView(context: vscode.ExtensionContext) {
  sessionTreeProvider = new SessionProvider(context);
  vscode.window.registerTreeDataProvider("sessionBuilderView", sessionTreeProvider);
}

type SessionItemKind = 'session' | 'restore' | 'delete' | 'filesRoot' | 'fileEntry';

class SessionItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly kind: SessionItemKind,
    public readonly sessionFile?: string,
    public readonly filePath?: string,
    command?: vscode.Command
  ) {
    super(label, collapsibleState);
    if (command) {this.command = command;};
  }
}

class SessionProvider implements vscode.TreeDataProvider<SessionItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<SessionItem | undefined | void> = new vscode.EventEmitter<SessionItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<SessionItem | undefined | void> = this._onDidChangeTreeData.event;

  constructor(private context: vscode.ExtensionContext) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SessionItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SessionItem): Thenable<SessionItem[]> {
    const sessionFolder = path.join(this.context.globalStorageUri.fsPath, 'sessions');
  
    // TOP LEVEL (All sessions + header + save button)
    if (!element) {
      try {
        if (!fs.existsSync(sessionFolder)) {
          return Promise.resolve([
            new SessionItem("💾 Save New Session", vscode.TreeItemCollapsibleState.None, 'restore', undefined, undefined, {
              command: "session-builder.saveSession",
              title: "Save Session"
            })
          ]);
        }
  
        const files = fs.readdirSync(sessionFolder)
          .filter(f => f.endsWith('.json'))
          .map(file => {
            const label = path.basename(file, '.json');
  
            const sessionItem = new SessionItem(
              label,
              vscode.TreeItemCollapsibleState.Collapsed,
              'session',
              file
            );
  
            sessionItem.tooltip = `Click to expand options for "${label}"`;
            sessionItem.contextValue = 'session';
            return sessionItem;
          });
  
        const saveItem = new SessionItem("💾 Save New Session", vscode.TreeItemCollapsibleState.None, 'restore', undefined, undefined, {
          command: "session-builder.saveSession",
          title: "Save Session"
        });
  
        const headerItem = new SessionItem("───── Sessions ─────", vscode.TreeItemCollapsibleState.None, 'restore');
  
        return Promise.resolve([saveItem, headerItem, ...files]);
  
      } catch (err) {
        console.error('Failed to list sessions:', err);
        return Promise.resolve([]);
      }
    }
  
    // EXPANDED SESSION VIEW (restore/delete/overwrite/view-files)
    if (element.kind === 'session' && element.sessionFile) {
      const restoreItem = new SessionItem(
        "📂 Restore Session",
        vscode.TreeItemCollapsibleState.None,
        'restore',
        element.sessionFile,
        undefined,
        {
          command: 'session-builder.restoreNamedSession',
          title: '',
          arguments: [element.sessionFile]
        }
      );
  
      const overwriteItem = new SessionItem(
        "📝 Overwrite Session",
        vscode.TreeItemCollapsibleState.None,
        'restore',
        element.sessionFile,
        undefined,
        {
          command: 'session-builder.overwriteSession',
          title: '',
          arguments: [element.sessionFile]
        }
      );
  
      const deleteItem = new SessionItem(
        "❌ Delete Session",
        vscode.TreeItemCollapsibleState.None,
        'delete',
        element.sessionFile,
        undefined,
        {
          command: 'session-builder.deleteSession',
          title: '',
          arguments: [element.sessionFile]
        }
      );
  
      const filesRootItem = new SessionItem(
        "📄 View Files",
        vscode.TreeItemCollapsibleState.Collapsed,
        'filesRoot',
        element.sessionFile
      );
  
      return Promise.resolve([restoreItem, overwriteItem, deleteItem, filesRootItem]);
    }
  
    // EXPANDED "📄 View Files" LIST
    if (element.kind === 'filesRoot' && element.sessionFile) {
      const sessionPath = path.join(sessionFolder, element.sessionFile);
      if (!fs.existsSync(sessionPath)) {
        return Promise.resolve([]);
      }
  
      try {
        const fileList: string[] = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  
        const fileItems = fileList.map(filePath => {
          const fileLabel = path.basename(filePath);
  
          const fileItem = new SessionItem(
            fileLabel,
            vscode.TreeItemCollapsibleState.None,
            'fileEntry',
            element.sessionFile,
            filePath,
            {
              command: 'vscode.open',
              title: 'Open File',
              arguments: [vscode.Uri.file(filePath)]
            }
          );
  
          fileItem.tooltip = filePath;
          fileItem.description = filePath;
  
          return fileItem;
        });
  
        return Promise.resolve(fileItems);
  
      } catch (e) {
        console.error('Failed to parse session file:', e);
        return Promise.resolve([]);
      }
    }
  
    return Promise.resolve([]);
  }
  
    
}





//#endregion
