import { defineConfig } from "file:///C:/Users/user/Downloads/Floorp/node_modules/.deno/vite@8.0.0-beta.4/node_modules/vite/dist/node/index.js";
import tailwindcss from "file:///C:/Users/user/Downloads/Floorp/node_modules/.deno/@tailwindcss+vite@4.1.18/node_modules/@tailwindcss/vite/dist/index.mjs";
import react from "file:///C:/Users/user/Downloads/Floorp/node_modules/.deno/@vitejs+plugin-react@5.1.2/node_modules/@vitejs/plugin-react/dist/index.js";
import tsconfigPaths from "file:///C:/Users/user/Downloads/Floorp/node_modules/.deno/vite-tsconfig-paths@6.0.3/node_modules/vite-tsconfig-paths/dist/index.js";

//#region ../../libs/vite-plugin-gen-jarmn/gen_jarmanifest.ts
const __vite_injected_original_dirname$3 = "C:\\Users\\user\\Downloads\\Floorp\\libs\\vite-plugin-gen-jarmn";
const __vite_injected_original_filename$3 = "C:\\Users\\user\\Downloads\\Floorp\\libs\\vite-plugin-gen-jarmn\\gen_jarmanifest.ts";
const __vite_injected_original_import_meta_url$3 = "file:///C:/Users/user/Downloads/Floorp/libs/vite-plugin-gen-jarmn/gen_jarmanifest.ts";
async function generateJarManifest(bundle, options) {
	console.log("generate jar.mn");
	const viteManifest = bundle;
	const arr = [];
	for (const i of Object.values(viteManifest)) {
		arr.push(i["fileName"].replaceAll("\\", "/"));
	}
	console.log("generate end jar.mn");
	return `noraneko.jar:\n% ${options.register_type} ${options.namespace} %nora-${options.prefix}/ contentaccessible=yes\n ${Array.from(new Set(arr)).map((v) => `nora-${options.prefix}/${v} (${v})`).join("\n ")}`;
}

//#endregion
//#region ../../libs/vite-plugin-gen-jarmn/plugin.ts
const __vite_injected_original_dirname$2 = "C:\\Users\\user\\Downloads\\Floorp\\libs\\vite-plugin-gen-jarmn";
const __vite_injected_original_filename$2 = "C:\\Users\\user\\Downloads\\Floorp\\libs\\vite-plugin-gen-jarmn\\plugin.ts";
const __vite_injected_original_import_meta_url$2 = "file:///C:/Users/user/Downloads/Floorp/libs/vite-plugin-gen-jarmn/plugin.ts";
async function pathExists(path) {
	try {
		await Deno.stat(path);
		return true;
	} catch {
		return false;
	}
}
function genJarmnPlugin(prefix, namespace, register_type) {
	let rootPath = "";
	return {
		name: "gen_jarmn",
		configResolved(config) {
			rootPath = config.root;
		},
		async generateBundle(options, bundle, isWrite) {
			const _bundle = await pathExists(rootPath + "/index.html") ? Object.assign({ "__index.html__": { fileName: "index.html" } }, bundle) : bundle;
			this.emitFile({
				type: "asset",
				fileName: "jar.mn",
				source: await generateJarManifest(_bundle, {
					prefix,
					namespace,
					register_type
				})
			});
			this.emitFile({
				type: "asset",
				fileName: "moz.build",
				source: `JAR_MANIFESTS += ["jar.mn"]`
			});
		}
	};
}

//#endregion
//#region ../../libs/vite-plugin-disable-csp/plugin.ts
const __vite_injected_original_dirname$1 = "C:\\Users\\user\\Downloads\\Floorp\\libs\\vite-plugin-disable-csp";
const __vite_injected_original_filename$1 = "C:\\Users\\user\\Downloads\\Floorp\\libs\\vite-plugin-disable-csp\\plugin.ts";
const __vite_injected_original_import_meta_url$1 = "file:///C:/Users/user/Downloads/Floorp/libs/vite-plugin-disable-csp/plugin.ts";
function disableCspInDevPlugin(isDev) {
	if (!isDev) {
		return null;
	}
	return {
		name: "disable-csp-in-dev",
		enforce: "post",
		transformIndexHtml(html) {
			return html.replace(/<meta http-equiv="Content-Security-Policy" content="[^"]*">/i, "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;\">");
		}
	};
}

//#endregion
//#region vite.config.ts
const __vite_injected_original_dirname = "C:\\Users\\user\\Downloads\\Floorp\\browser-features\\pages-settings";
const __vite_injected_original_filename = "C:\\Users\\user\\Downloads\\Floorp\\browser-features\\pages-settings\\vite.config.ts";
const __vite_injected_original_import_meta_url = "file:///C:/Users/user/Downloads/Floorp/browser-features/pages-settings/vite.config.ts";
var vite_config_default = defineConfig(({ command }) => ({
	build: { outDir: "_dist" },
	plugins: [
		tailwindcss(),
		react({ jsxImportSource: "react" }),
		tsconfigPaths(),
		genJarmnPlugin("content-settings", "noraneko-settings", "content"),
		disableCspInDevPlugin(command === "serve")
	],
	optimizeDeps: { include: [
		"react",
		"react-dom",
		"react/jsx-runtime"
	] },
	server: { hmr: { overlay: true } }
}));

//#endregion
export { vite_config_default as default };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidml0ZS5jb25maWcuanMiLCJuYW1lcyI6W10sInNvdXJjZXMiOlsiQzovVXNlcnMvdXNlci9Eb3dubG9hZHMvRmxvb3JwL2xpYnMvdml0ZS1wbHVnaW4tZ2VuLWphcm1uL2dlbl9qYXJtYW5pZmVzdC50cyIsIkM6L1VzZXJzL3VzZXIvRG93bmxvYWRzL0Zsb29ycC9saWJzL3ZpdGUtcGx1Z2luLWdlbi1qYXJtbi9wbHVnaW4udHMiLCJDOi9Vc2Vycy91c2VyL0Rvd25sb2Fkcy9GbG9vcnAvbGlicy92aXRlLXBsdWdpbi1kaXNhYmxlLWNzcC9wbHVnaW4udHMiLCJDOi9Vc2Vycy91c2VyL0Rvd25sb2Fkcy9GbG9vcnAvYnJvd3Nlci1mZWF0dXJlcy9wYWdlcy1zZXR0aW5ncy92aXRlLmNvbmZpZy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBTUERYLUxpY2Vuc2UtSWRlbnRpZmllcjogTVBMLTIuMFxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRlSmFyTWFuaWZlc3QoXHJcbiAgYnVuZGxlOiBvYmplY3QsXHJcbiAgb3B0aW9uczoge1xyXG4gICAgcHJlZml4OiBzdHJpbmc7XHJcbiAgICBuYW1lc3BhY2U6IHN0cmluZztcclxuICAgIHJlZ2lzdGVyX3R5cGU6IFwiY29udGVudFwiIHwgXCJza2luXCIgfCBcInJlc291cmNlXCI7XHJcbiAgfSxcclxuKSB7XHJcbiAgY29uc29sZS5sb2coXCJnZW5lcmF0ZSBqYXIubW5cIik7XHJcbiAgY29uc3Qgdml0ZU1hbmlmZXN0ID0gYnVuZGxlO1xyXG5cclxuICBjb25zdCBhcnIgPSBbXTtcclxuICBmb3IgKGNvbnN0IGkgb2YgT2JqZWN0LnZhbHVlcyh2aXRlTWFuaWZlc3QpKSB7XHJcbiAgICBhcnIucHVzaCgoaSBhcyB7IGZpbGVOYW1lOiBzdHJpbmcgfSlbXCJmaWxlTmFtZVwiXS5yZXBsYWNlQWxsKFwiXFxcXFwiLCBcIi9cIikpO1xyXG4gIH1cclxuICBjb25zb2xlLmxvZyhcImdlbmVyYXRlIGVuZCBqYXIubW5cIik7XHJcblxyXG4gIHJldHVybiBgbm9yYW5la28uamFyOlxcbiUgJHtvcHRpb25zLnJlZ2lzdGVyX3R5cGV9ICR7b3B0aW9ucy5uYW1lc3BhY2V9ICVub3JhLSR7b3B0aW9ucy5wcmVmaXh9LyBjb250ZW50YWNjZXNzaWJsZT15ZXNcXG4gJHtBcnJheS5mcm9tKFxyXG4gICAgbmV3IFNldChhcnIpLFxyXG4gIClcclxuICAgIC5tYXAoKHYpID0+IGBub3JhLSR7b3B0aW9ucy5wcmVmaXh9LyR7dn0gKCR7dn0pYClcclxuICAgIC5qb2luKFwiXFxuIFwiKX1gO1xyXG59XHJcbiIsIi8vIFNQRFgtTGljZW5zZS1JZGVudGlmaWVyOiBNUEwtMi4wXHJcblxyXG5pbXBvcnQgeyBnZW5lcmF0ZUphck1hbmlmZXN0IH0gZnJvbSBcIi4vZ2VuX2phcm1hbmlmZXN0LnRzXCI7XHJcbmltcG9ydCB0eXBlIHsgUGx1Z2luIH0gZnJvbSBcInJvbGxkb3duXCI7XHJcblxyXG4vLyBVc2UgRGVubydzIGZpbGVzeXN0ZW0gQVBJIGluc3RlYWQgb2YgTm9kZSdzIGBmc2AuXHJcbmFzeW5jIGZ1bmN0aW9uIHBhdGhFeGlzdHMocGF0aDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XHJcbiAgdHJ5IHtcclxuICAgIGF3YWl0IERlbm8uc3RhdChwYXRoKTtcclxuICAgIHJldHVybiB0cnVlO1xyXG4gIH0gY2F0Y2gge1xyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG4gIH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdlbkphcm1uUGx1Z2luKFxyXG4gIHByZWZpeDogc3RyaW5nLFxyXG4gIG5hbWVzcGFjZTogc3RyaW5nLFxyXG4gIHJlZ2lzdGVyX3R5cGU6IFwiY29udGVudFwiIHwgXCJza2luXCIgfCBcInJlc291cmNlXCIsXHJcbikge1xyXG4gIGxldCByb290UGF0aCA9IFwiXCI7XHJcbiAgcmV0dXJuIHtcclxuICAgIG5hbWU6IFwiZ2VuX2phcm1uXCIsXHJcbiAgICBjb25maWdSZXNvbHZlZChjb25maWcpIHtcclxuICAgICAgcm9vdFBhdGggPSBjb25maWcucm9vdDtcclxuICAgIH0sXHJcbiAgICBhc3luYyBnZW5lcmF0ZUJ1bmRsZShvcHRpb25zLCBidW5kbGUsIGlzV3JpdGUpIHtcclxuICAgICAgY29uc3QgX2J1bmRsZSA9IChhd2FpdCBwYXRoRXhpc3RzKHJvb3RQYXRoICsgXCIvaW5kZXguaHRtbFwiKSlcclxuICAgICAgICA/IE9iamVjdC5hc3NpZ24oXHJcbiAgICAgICAgICAgIHsgXCJfX2luZGV4Lmh0bWxfX1wiOiB7IGZpbGVOYW1lOiBcImluZGV4Lmh0bWxcIiB9IH0sXHJcbiAgICAgICAgICAgIGJ1bmRsZSxcclxuICAgICAgICAgIClcclxuICAgICAgICA6IGJ1bmRsZTtcclxuICAgICAgdGhpcy5lbWl0RmlsZSh7XHJcbiAgICAgICAgdHlwZTogXCJhc3NldFwiLFxyXG4gICAgICAgIGZpbGVOYW1lOiBcImphci5tblwiLFxyXG4gICAgICAgIHNvdXJjZTogYXdhaXQgZ2VuZXJhdGVKYXJNYW5pZmVzdChfYnVuZGxlLCB7XHJcbiAgICAgICAgICBwcmVmaXgsXHJcbiAgICAgICAgICBuYW1lc3BhY2UsXHJcbiAgICAgICAgICByZWdpc3Rlcl90eXBlLFxyXG4gICAgICAgIH0pLFxyXG4gICAgICB9KTtcclxuICAgICAgdGhpcy5lbWl0RmlsZSh7XHJcbiAgICAgICAgdHlwZTogXCJhc3NldFwiLFxyXG4gICAgICAgIGZpbGVOYW1lOiBcIm1vei5idWlsZFwiLFxyXG4gICAgICAgIHNvdXJjZTogYEpBUl9NQU5JRkVTVFMgKz0gW1wiamFyLm1uXCJdYCxcclxuICAgICAgfSk7XHJcbiAgICB9LFxyXG4gIH0gc2F0aXNmaWVzIFBsdWdpbjtcclxufVxyXG4iLCIvLyBTUERYLUxpY2Vuc2UtSWRlbnRpZmllcjogTVBMLTIuMFxyXG5cclxuLyogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xyXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXHJcbiAqIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uICovXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZGlzYWJsZUNzcEluRGV2UGx1Z2luKGlzRGV2OiBib29sZWFuKSB7XHJcbiAgaWYgKCFpc0Rldikge1xyXG4gICAgcmV0dXJuIG51bGw7XHJcbiAgfVxyXG5cclxuICByZXR1cm4ge1xyXG4gICAgbmFtZTogXCJkaXNhYmxlLWNzcC1pbi1kZXZcIixcclxuICAgIGVuZm9yY2U6IFwicG9zdFwiLFxyXG4gICAgdHJhbnNmb3JtSW5kZXhIdG1sKGh0bWw6IHN0cmluZykge1xyXG4gICAgICByZXR1cm4gaHRtbC5yZXBsYWNlKFxyXG4gICAgICAgIC88bWV0YSBodHRwLWVxdWl2PVwiQ29udGVudC1TZWN1cml0eS1Qb2xpY3lcIiBjb250ZW50PVwiW15cIl0qXCI+L2ksXHJcbiAgICAgICAgXCI8bWV0YSBodHRwLWVxdWl2PVxcXCJDb250ZW50LVNlY3VyaXR5LVBvbGljeVxcXCIgY29udGVudD1cXFwiZGVmYXVsdC1zcmMgKiAndW5zYWZlLWlubGluZScgJ3Vuc2FmZS1ldmFsJyBkYXRhOiBibG9iOjtcXFwiPlwiLFxyXG4gICAgICApO1xyXG4gICAgfSxcclxuICB9O1xyXG59XHJcbiIsImltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gXCJ2aXRlXCI7XHJcbmltcG9ydCB0YWlsd2luZGNzcyBmcm9tIFwiQHRhaWx3aW5kY3NzL3ZpdGVcIjtcclxuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdFwiO1xyXG5pbXBvcnQgdHNjb25maWdQYXRocyBmcm9tIFwidml0ZS10c2NvbmZpZy1wYXRoc1wiO1xyXG5pbXBvcnQgeyBnZW5KYXJtblBsdWdpbiB9IGZyb20gXCIuLi8uLi9saWJzL3ZpdGUtcGx1Z2luLWdlbi1qYXJtbi9wbHVnaW4udHNcIjtcclxuaW1wb3J0IHsgZGlzYWJsZUNzcEluRGV2UGx1Z2luIH0gZnJvbSBcIi4uLy4uL2xpYnMvdml0ZS1wbHVnaW4tZGlzYWJsZS1jc3AvcGx1Z2luLnRzXCI7XHJcbmltcG9ydCB7IGJhcnJlbCB9IGZyb20gXCJ2aXRlLXBsdWdpbi1iYXJyZWxcIlxyXG5cclxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKCh7IGNvbW1hbmQgfSkgPT4gKHtcclxuICBidWlsZDoge1xyXG4gICAgb3V0RGlyOiBcIl9kaXN0XCIsXHJcbiAgfSxcclxuICBwbHVnaW5zOiBbXHJcbiAgICB0YWlsd2luZGNzcygpLFxyXG4gICAgcmVhY3Qoe1xyXG4gICAgICBqc3hJbXBvcnRTb3VyY2U6IFwicmVhY3RcIixcclxuICAgIH0pLFxyXG4gICAgdHNjb25maWdQYXRocygpLFxyXG4gICAgZ2VuSmFybW5QbHVnaW4oXCJjb250ZW50LXNldHRpbmdzXCIsIFwibm9yYW5la28tc2V0dGluZ3NcIiwgXCJjb250ZW50XCIpLFxyXG4gICAgZGlzYWJsZUNzcEluRGV2UGx1Z2luKGNvbW1hbmQgPT09IFwic2VydmVcIiksXHJcbiAgXSxcclxuICBvcHRpbWl6ZURlcHM6IHtcclxuICAgIGluY2x1ZGU6IFtcInJlYWN0XCIsIFwicmVhY3QtZG9tXCIsIFwicmVhY3QvanN4LXJ1bnRpbWVcIl0sXHJcbiAgfSxcclxuICBzZXJ2ZXI6IHtcclxuICAgIGhtcjoge1xyXG4gICAgICBvdmVybGF5OiB0cnVlLFxyXG4gICAgfSxcclxuICB9LFxyXG59KSk7XHJcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsTUFBRyxxQ0FBZ0M7QUFBQSxNQUFBLHNDQUFBO0FBQUEsTUFBQSw2Q0FBQTtBQUVuQyxlQUFzQixvQkFDcEIsUUFDQSxTQUtBO0FBQ0EsU0FBUSxJQUFJLGtCQUFrQjtDQUM5QixNQUFNLGVBQWU7Q0FFckIsTUFBTSxNQUFNLEVBQUU7QUFDZCxNQUFLLE1BQU0sS0FBSyxPQUFPLE9BQU8sYUFBYSxFQUFFO0FBQzNDLE1BQUksS0FBTSxFQUEyQixZQUFZLFdBQVcsTUFBTSxJQUFJLENBQUM7O0FBRXpFLFNBQVEsSUFBSSxzQkFBc0I7QUFFbEMsUUFBTyxvQkFBb0IsUUFBUSxjQUFjLEdBQUcsUUFBUSxVQUFVLFNBQVMsUUFBUSxPQUFPLDRCQUE0QixNQUFNLEtBQzlILElBQUksSUFBSSxJQUFJLENBQ2IsQ0FDRSxLQUFLLE1BQU0sUUFBUSxRQUFRLE9BQU8sR0FBRyxFQUFFLElBQUksRUFBRSxHQUFHLENBQ2hELEtBQUssTUFBTTs7Ozs7QUN2QmhCLE1BQUcscUNBQWdDO0FBQUEsTUFBQSxzQ0FBQTtBQUFBLE1BQUEsNkNBQUE7QUFNbkMsZUFBZSxXQUFXLE1BQWdDO0FBQ3hELEtBQUk7QUFDRixRQUFNLEtBQUssS0FBSyxLQUFLO0FBQ3JCLFNBQU87U0FDRDtBQUNOLFNBQU87OztBQUlYLFNBQWdCLGVBQ2QsUUFDQSxXQUNBLGVBQ0E7Q0FDQSxJQUFJLFdBQVc7QUFDZixRQUFPO0VBQ0wsTUFBTTtFQUNOLGVBQWUsUUFBUTtBQUNyQixjQUFXLE9BQU87O0VBRXBCLE1BQU0sZUFBZSxTQUFTLFFBQVEsU0FBUztHQUM3QyxNQUFNLFVBQVcsTUFBTSxXQUFXLFdBQVcsY0FBYyxHQUN2RCxPQUFPLE9BQ0wsRUFBRSxrQkFBa0IsRUFBRSxVQUFVLGNBQWMsRUFBRSxFQUNoRCxPQUNELEdBQ0Q7QUFDSixRQUFLLFNBQVM7SUFDWixNQUFNO0lBQ04sVUFBVTtJQUNWLFFBQVEsTUFBTSxvQkFBb0IsU0FBUztLQUN6QztLQUNBO0tBQ0E7S0FDRCxDQUFDO0lBQ0gsQ0FBQztBQUNGLFFBQUssU0FBUztJQUNaLE1BQU07SUFDTixVQUFVO0lBQ1YsUUFBUTtJQUNULENBQUM7O0VBRUw7Ozs7O0FDaERILE1BQUcscUNBQWdDO0FBQUEsTUFBQSxzQ0FBQTtBQUFBLE1BQUEsNkNBQUE7QUFNbkMsU0FBZ0Isc0JBQXNCLE9BQWdCO0FBQ3BELEtBQUksQ0FBQyxPQUFPO0FBQ1YsU0FBTzs7QUFHVCxRQUFPO0VBQ0wsTUFBTTtFQUNOLFNBQVM7RUFDVCxtQkFBbUIsTUFBYztBQUMvQixVQUFPLEtBQUssUUFDVixnRUFDQSxxSEFDRDs7RUFFSjs7Ozs7QUNwQkgsTUFBTSxtQ0FBOEI7QUFBQSxNQUFBLG9DQUFBO0FBQUEsTUFBQSwyQ0FBQTtBQVFwQywwQkFBZSxjQUFjLEVBQUUsZUFBZTtDQUM1QyxPQUFPLEVBQ0wsUUFBUSxTQUNUO0NBQ0QsU0FBUztFQUNQLGFBQWE7RUFDYixNQUFNLEVBQ0osaUJBQWlCLFNBQ2xCLENBQUM7RUFDRixlQUFlO0VBQ2YsZUFBZSxvQkFBb0IscUJBQXFCLFVBQVU7RUFDbEUsc0JBQXNCLFlBQVksUUFBUTtFQUMzQztDQUNELGNBQWMsRUFDWixTQUFTO0VBQUM7RUFBUztFQUFhO0VBQW9CLEVBQ3JEO0NBQ0QsUUFBUSxFQUNOLEtBQUssRUFDSCxTQUFTLE1BQ1YsRUFDRjtDQUNGLEVBQUUifQ==