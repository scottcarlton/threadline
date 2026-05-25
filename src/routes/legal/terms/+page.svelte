<script lang="ts">
	import { resolve } from '$app/paths';
	import MarketingNav from '$lib/components/marketing/MarketingNav.svelte';
	import MarketingFooter from '$lib/components/marketing/MarketingFooter.svelte';
</script>

<svelte:head>
	<title>Terms of Use — Threadline</title>
</svelte:head>

<MarketingNav />

<main class="mx-auto px-8 pt-40 pb-24" style="max-width: clamp(72ch, 75%, 50vw);">
	<h1 class="text-[2.5rem] leading-tight font-semibold tracking-tight">Terms of Use</h1>
	<p class="mt-2 text-sm text-muted-foreground">Effective date: May 9, 2026</p>

	<div class="mt-10 space-y-8 text-base leading-relaxed text-muted-foreground">
		<section>
			<h2 class="mb-2 text-lg font-semibold text-foreground">1. Acceptance of Terms</h2>
			<p>
				By accessing or using the Threadline platform ("Service") operated by Threadline Systems
				("we", "us", "our"), you agree to be bound by these Terms of Use. If you do not agree, do
				not use the Service.
			</p>
		</section>

		<section>
			<h2 class="mb-2 text-lg font-semibold text-foreground">2. Description of Service</h2>
			<p>
				Threadline is a wholesale intelligence platform for multi-brand sales representatives and
				brands. The Service includes web-based tools for managing orders, accounts, commissions, and
				related business operations.
			</p>
		</section>

		<section>
			<h2 class="mb-2 text-lg font-semibold text-foreground">3. Accounts and Registration</h2>
			<p>
				You must provide accurate and complete information when creating an account. You are
				responsible for maintaining the confidentiality of your login credentials and for all
				activity under your account. Notify us immediately if you suspect unauthorized access.
			</p>
		</section>

		<section>
			<h2 class="mb-2 text-lg font-semibold text-foreground">4. Acceptable Use</h2>
			<p>You agree not to:</p>
			<ul class="mt-2 list-disc space-y-1 pl-5">
				<li>Use the Service for any unlawful purpose</li>
				<li>Attempt to gain unauthorized access to any part of the Service</li>
				<li>Interfere with or disrupt the Service or its infrastructure</li>
				<li>Upload malicious code, viruses, or harmful content</li>
				<li>Scrape, crawl, or extract data from the Service without permission</li>
				<li>Resell or redistribute the Service without written consent</li>
			</ul>
		</section>

		<section>
			<h2 class="mb-2 text-lg font-semibold text-foreground">5. Intellectual Property</h2>
			<p>
				All content, features, and functionality of the Service — including text, graphics, logos,
				and software — are owned by Threadline Systems and protected by applicable intellectual
				property laws. You may not copy, modify, or distribute any part of the Service without prior
				written consent.
			</p>
		</section>

		<section>
			<h2 class="mb-2 text-lg font-semibold text-foreground">6. User Content</h2>
			<p>
				You retain ownership of data and content you submit to the Service. By submitting content,
				you grant us a limited license to use, store, and process it solely to provide the Service.
				We do not sell your data to third parties.
			</p>
		</section>

		<section>
			<h2 class="mb-2 text-lg font-semibold text-foreground">7. Privacy</h2>
			<p>
				Your use of the Service is also governed by our
				<a href={resolve('/legal/privacy')} class="underline hover:text-foreground"
					>Privacy Policy</a
				>, which describes how we collect, use, and protect your information.
			</p>
		</section>

		<section>
			<h2 class="mb-2 text-lg font-semibold text-foreground">8. Service Availability</h2>
			<p>
				We strive to keep the Service available at all times but do not guarantee uninterrupted
				access. We may modify, suspend, or discontinue any part of the Service at any time, with or
				without notice.
			</p>
		</section>

		<section>
			<h2 class="mb-2 text-lg font-semibold text-foreground">9. Limitation of Liability</h2>
			<p>
				To the maximum extent permitted by law, Threadline Systems shall not be liable for any
				indirect, incidental, special, consequential, or punitive damages arising from your use of
				the Service. Our total liability shall not exceed the amount you paid us in the twelve
				months preceding the claim.
			</p>
		</section>

		<section>
			<h2 class="mb-2 text-lg font-semibold text-foreground">10. Disclaimer of Warranties</h2>
			<p>
				The Service is provided "as is" and "as available" without warranties of any kind, whether
				express or implied, including but not limited to implied warranties of merchantability,
				fitness for a particular purpose, and non-infringement.
			</p>
		</section>

		<section>
			<h2 class="mb-2 text-lg font-semibold text-foreground">11. Termination</h2>
			<p>
				We may terminate or suspend your account at our discretion, without prior notice, for
				conduct that we believe violates these Terms or is harmful to other users or the Service.
				Upon termination, your right to use the Service ceases immediately.
			</p>
		</section>

		<section>
			<h2 class="mb-2 text-lg font-semibold text-foreground">12. Changes to Terms</h2>
			<p>
				We may update these Terms from time to time. We will notify you of material changes by
				posting the updated Terms on this page with a revised effective date. Continued use of the
				Service after changes constitutes acceptance of the new Terms.
			</p>
		</section>

		<section>
			<h2 class="mb-2 text-lg font-semibold text-foreground">13. Governing Law</h2>
			<p>
				These Terms are governed by the laws of the State of California, without regard to conflict
				of law principles.
			</p>
		</section>

		<section>
			<h2 class="mb-2 text-lg font-semibold text-foreground">14. Contact</h2>
			<p>
				Questions about these Terms? Contact us at
				<a href="mailto:hello@threadline.systems" class="underline hover:text-foreground"
					>hello@threadline.systems</a
				>.
			</p>
		</section>
	</div>
</main>

<MarketingFooter />
