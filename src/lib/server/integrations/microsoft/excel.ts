import { graphFetch } from './oauth.js';

export async function createExcelWorkbook(
	organizationId: string,
	fileName: string
): Promise<{ id: string; webUrl: string } | null> {
	// Create a new Excel file in OneDrive root
	const data = await graphFetch(organizationId, `/me/drive/root:/${fileName}.xlsx:/content`, {
		method: 'PUT',
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
		},
		body: ''
	});

	if (!data) return null;
	return { id: data.id, webUrl: data.webUrl };
}

export async function exportToExcel(
	organizationId: string,
	options: {
		fileName: string;
		sheetName: string;
		headers: string[];
		rows: (string | number | null)[][];
	}
): Promise<{ webUrl: string; rowCount: number } | null> {
	// Create the workbook
	const workbook = await createExcelWorkbook(organizationId, options.fileName);
	if (!workbook) return null;

	const itemId = workbook.id;

	// Rename the default sheet
	const sheetsData = await graphFetch(
		organizationId,
		`/me/drive/items/${itemId}/workbook/worksheets`
	);

	if (sheetsData?.value?.[0]) {
		const sheetId = sheetsData.value[0].id;
		await graphFetch(organizationId, `/me/drive/items/${itemId}/workbook/worksheets/${sheetId}`, {
			method: 'PATCH',
			body: JSON.stringify({ name: options.sheetName })
		});
	}

	// Write data: headers + rows
	const values = [options.headers, ...options.rows];
	const endCol = String.fromCharCode(64 + options.headers.length); // A=65, so headers.length=1 => A
	const range = `A1:${endCol}${values.length}`;

	await graphFetch(
		organizationId,
		`/me/drive/items/${itemId}/workbook/worksheets('${options.sheetName}')/range(address='${range}')`,
		{
			method: 'PATCH',
			body: JSON.stringify({ values })
		}
	);

	// Bold the header row
	await graphFetch(
		organizationId,
		`/me/drive/items/${itemId}/workbook/worksheets('${options.sheetName}')/range(address='A1:${endCol}1')/format/font`,
		{
			method: 'PATCH',
			body: JSON.stringify({ bold: true })
		}
	);

	return { webUrl: workbook.webUrl, rowCount: options.rows.length };
}

export async function listDriveFiles(
	organizationId: string,
	mimeType?: string
): Promise<{ id: string; name: string; webUrl: string }[]> {
	let path =
		'/me/drive/root/children?$select=id,name,webUrl,file&$top=50&$orderby=lastModifiedDateTime desc';

	if (mimeType) {
		// Filter to Excel files only
		path += `&$filter=file/mimeType eq '${mimeType}'`;
	}

	const data = await graphFetch(organizationId, path);
	if (!data?.value) return [];

	return data.value
		.filter((f: any) => f.file)
		.map((f: any) => ({
			id: f.id,
			name: f.name,
			webUrl: f.webUrl
		}));
}
