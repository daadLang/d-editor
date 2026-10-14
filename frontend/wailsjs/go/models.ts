export namespace main {
	
	export class FileEntry {
	    name: string;
	    path: string;
	    isDirectory: boolean;
	
	    static createFrom(source: any = {}) {
	        return new FileEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.isDirectory = source["isDirectory"];
	    }
	}
	export class InterpreterInfo {
	    path: string;
	    version: string;
	    latestVersion: string;
	    latestUrl: string;
	    updateAvailable: boolean;
	
	    static createFrom(source: any = {}) {
	        return new InterpreterInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.version = source["version"];
	        this.latestVersion = source["latestVersion"];
	        this.latestUrl = source["latestUrl"];
	        this.updateAvailable = source["updateAvailable"];
	    }
	}
	export class InterpreterOption {
	    id: string;
	    label: string;
	    path: string;
	    version: string;
	    source: string;
	    releaseTag: string;
	    releaseUrl: string;
	    installed: boolean;
	    selected: boolean;
	    latest: boolean;
	
	    static createFrom(source: any = {}) {
	        return new InterpreterOption(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	        this.path = source["path"];
	        this.version = source["version"];
	        this.source = source["source"];
	        this.releaseTag = source["releaseTag"];
	        this.releaseUrl = source["releaseUrl"];
	        this.installed = source["installed"];
	        this.selected = source["selected"];
	        this.latest = source["latest"];
	    }
	}
	export class InterpreterStatus {
	    found: boolean;
	    path: string;
	    version: string;
	    label: string;
	    source: string;
	    reason: string;
	
	    static createFrom(source: any = {}) {
	        return new InterpreterStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.found = source["found"];
	        this.path = source["path"];
	        this.version = source["version"];
	        this.label = source["label"];
	        this.source = source["source"];
	        this.reason = source["reason"];
	    }
	}

}

